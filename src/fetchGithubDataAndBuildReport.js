const octokit = require('@octokit/rest')();
const generateKarmaReport = require('./generateKarmaReport');

// wrap setTimeout in a Promise so we can 'await' a time delay
function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const uniqueFilter = (v, i, a) => a.indexOf(v) === i;

/**
 * Flatten an array that has at most one level of nested array elements
 * @param {Array(Array)} arrayOfArrays 
 */
function shallowFlatten(arrayOfArrays) {
  return arrayOfArrays.reduce((acc, elem) => acc.concat(elem), []);
}

/**
 * Fetch all octokit API results by fetching all pages until complete
 * @param {function} method 
 * @param {Array} queryProperties 
 */
async function paginate(method, queryProperties = {}, logger) {
  const queryObject = {
    per_page: 50,
  };

  // apply any additional query properties
  if (Object.keys(queryProperties)) {
    Object.assign(queryObject, queryProperties)
  }

  try {
    const options = method.endpoint.merge(queryObject)
    const data = await octokit.paginate(
      options,
      (response) => {
        return (method === octokit.search.issues) ? response.data.items : response.data
      }
    );
    return data;
  } catch(e) {
    if (e.message) {
      if (e.message.documentation_url && e.message.documentation_url.includes('abuse-rate-limits')) {
        logger('Use of this script has triggered Github\'s abuse detection mechanism due to too many API requests being sent. Please wait a few minutes and try again.');        
      } else {
        logger(`Github Error: ${e.message}`);
      }
      process.exit(1);
    }
  }
}

/**
 * Filter out files that should not contribute to the karma score
 * @param {*} files 
 */
function filterFiles(files) {
  const excludeRegexes = [
    /^.*yarn[-,\.]|package-lock\.json.*$/, // omit changes to yarn/npm lock and error log files
  ]
  return files.filter(
    file => !excludeRegexes.some(regex => file.filename.match(regex))
  );
}

function mergeKarmaScoreMaps(karmaScoreMaps) {
  return karmaScoreMaps.reduce( 
    (mergedScores, scoreMap) => {
      Object.keys(scoreMap).forEach(reviewer => {
        const currentScore = mergedScores[reviewer];
        if (currentScore) {
          mergedScores[reviewer] += scoreMap[reviewer];
        } else {
          mergedScores[reviewer] = scoreMap[reviewer];
        }
      });
      return mergedScores;
    },
    {}
  );
}

async function fetchGithubDataAndBuildReport({
  githubAccessToken,
  logger,
  githubOrg,
  githubTeams,
  daysToReport,
  karmaPerReview,
  karmaPercentPerComment
}) {
  const mergedSinceDate = new Date();
  mergedSinceDate.setDate(mergedSinceDate.getDate() - daysToReport);

  octokit.authenticate({
    type: 'oauth',
    token: githubAccessToken,
  });

  const teams = await paginate(
    octokit.teams.list,
    { org: githubOrg },
    logger
  );

  const teamIds = teams.filter(team => githubTeams.includes(team.name)).map(team => team.id);

  const usersPerTeamList = await Promise.all(teamIds.map(async (teamId) => {
    return await paginate(
      octokit.teams.listMembers,
      {
        team_id: teamId,
        org: githubOrg,
      },
      logger,
    );
  }));
  // flatten the per-team users arrays to a single array
  const teamUsers = shallowFlatten(usersPerTeamList);

  const teamUserLogins = teamUsers.map(user => user.login);

  // get repositories associated with github teams(s)
  const teamRepositories = shallowFlatten(
    await Promise.all(teamIds.map(async (teamId) => {
      return await paginate(
        octokit.teams.listRepos,
        {
          team_id: teamId,
          org: githubOrg,
        },
        logger,
      );
    }))
  ).map(repository => repository.name)
    .filter(uniqueFilter);

  const delayPromises = [];
  let pullRequestCount = 0;

  // fetch pull request data for each repository
  const repoPromises = teamRepositories.map(async (repository, repoIndex) => {

    const pullRequests = await paginate(
      octokit.search.issues,
      {
        q: `repo:${githubOrg}/${repository} is:pr merged:>=${mergedSinceDate.toISOString().slice(0, 10)} -author:optibot-cd`,
      },
      logger,
    );

    pullRequestCount += pullRequests.length;
    
    pullRequests.forEach((pullRequest, prIndex) => {
      const delayPromise = (async () => {
        // add some variable latency to each batch of API requests to avoid trigerring github API abuse detection
        await timeout(5 + 10 * prIndex + 100 * repoIndex); 
    
        const prQuery = {
          owner: githubOrg,
          repo: repository,
          number: pullRequest.number,
        };
        return [
          // API request to fetch file details for this pull request
          paginate(octokit.pullRequests.listFiles, prQuery, logger),
          // API request to fetch reviews for this pull request
          paginate(octokit.pullRequests.listReviews, prQuery, logger),
          // Save a reference to the pull request author
          Promise.resolve(pullRequest.user.login),
        ];
      })();
      delayPromises.push(delayPromise);
      return;
    });
    
  });

  await Promise.all(repoPromises);
  const promiseArrays = await Promise.all(delayPromises);

  // Process each pull request for per-user code review karma
  const karmaPerPullRequestMaps = await Promise.all(promiseArrays.map(async (promiseArray) => {
    const [files, reviews, author] = await Promise.all(promiseArray);
    const additionsReducer = (acc, file) => (acc + file.additions);
    const allFileAdditions = filterFiles(files).reduce(additionsReducer, 0);
    const approvingReviewers = reviews
      .filter(review => review.state === 'APPROVED') // reviewers that actually approved the PR
      .map(review => review.user.login)  // map the reviews to the reviewers' github account names
      .filter(uniqueFilter) // eliminate duplicate reviewers (if same user reviewed the PR mutiple times)
      .filter(reviewer => teamUserLogins.includes(reviewer)); // only consider reviews from users in the team we are analyzing

    const commentingReviewers = reviews
      .filter(review => review.state !== 'APPROVED') // reviewers that commented on the PR
      .map(review => review.user.login)  // map the reviews to the reviewers' github account names
      .filter(uniqueFilter) // eliminate duplicate reviewers (if same user reviewed the PR mutiple times)
      .filter(
        reviewer =>
          teamUserLogins.includes(reviewer) && // only consider reviews from users in the team we are analyzing
          !approvingReviewers.includes(reviewer) && // discard comment reviews from an approving reviewer
          reviewer !== author // exclude comments made by the PR author
      );

    // determine karma scores for this PR
    const karmaPerPullRequestMap = {};
    approvingReviewers.forEach((reviewer) => {
      karmaPerPullRequestMap[reviewer] = karmaPerReview + allFileAdditions;
    });
    commentingReviewers.forEach((reviewer) => {
      karmaPerPullRequestMap[reviewer] = Math.trunc((karmaPercentPerComment / 100) * allFileAdditions);
    });

    return karmaPerPullRequestMap;
  }));

  return [
    generateKarmaReport(mergeKarmaScoreMaps(karmaPerPullRequestMaps)),
    {
      pullRequestCount,
      reviewers: teamUserLogins,
    }
  ];
}

module.exports = fetchGithubDataAndBuildReport;
