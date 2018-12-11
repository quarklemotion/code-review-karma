const octokit = require('@octokit/rest')();

/*
 * This script uses the github API to inspect recently merged frontend pull requests
 * to determine the percentage of these pull requests that touch Vue components.
 *
 * Usage:
 * >export GITHUB_ACCESS_TOKEN=xyz123
 * >node ./src/scripts/code-review-karma-report.js
 */
const KARMA_PER_REVIEW = 50; // karma each user gets per review
const ORG_NAME = 'optimizely';
const TEAM_NAMES = 'Frontend,ui-engineers'; // team names to do karma analysis for
const DAYS_TO_SEARCH = 30;

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  default: '\x1b[0m',
}

const mergedSinceDate = new Date();
mergedSinceDate.setDate(mergedSinceDate.getDate() - DAYS_TO_SEARCH);

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
 * Render text with specified color on the terminal
 * @param {string} string 
 * @param {string} color 
 */
function withColor(string, color) {
  return `${colors[color]}${string}${colors.default}`;
}

let apiRequestCount = 0;

/**
 * Fetch all octokit API results by fetching all pages until complete
 * @param {function} method 
 * @param {Array} queryProperties 
 */
async function paginate(method, queryProperties = {}) {
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
        apiRequestCount += 1;
        return (method === octokit.search.issues) ? response.data.items : response.data
      }
    );
    return data;
  } catch(e) {
    if (e.message) {
      if (e.message.documentation_url && e.message.documentation_url.includes('abuse-rate-limits')) {
        console.log('Use of this script has triggered Github\'s abuse detection mechanism due to too many API requests being sent. Please wait a few minutes and try again.');        
      } else {
        console.log(`Github Error: ${e.message}`);
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

const reviewerKarmaScores = {};

/**
 * Generate the Code Review Karma report
 * @param {Array(Object)} karmaPerPullRequestMaps 
 */
function generateReport(karmaPerPullRequestMaps) {
  const reviewersCount = Object.keys(reviewerKarmaScores).length;
  const reviewersCountText = withColor(reviewersCount, 'magenta');
  const daysCountText = withColor(DAYS_TO_SEARCH.toString(), 'magenta');
  console.log(`Preparing code review karma report (${reviewersCountText} team reviewers over ${daysCountText} days) ...`);
  const sortableKarmaScores = [];
  let sumOfAllScores = 0;
  for (const reviewer in reviewerKarmaScores) {
    sortableKarmaScores.push([reviewer, reviewerKarmaScores[reviewer]]);
    sumOfAllScores += reviewerKarmaScores[reviewer];
  }
  const averageScore = Math.trunc(sumOfAllScores / reviewersCount);
  const longestReviewer = Math.max(12, ...sortableKarmaScores.map(karmaScore => karmaScore[0].length));
  const longestScore = Math.max(...sortableKarmaScores.map(karmaScore => karmaScore[1].toString().length));
  sortableKarmaScores.sort((a, b) => b[1] - a[1]);
  const horizontalRule = `--${''.padEnd(longestReviewer, '-')}----------------------------`;
  console.log(horizontalRule);
  console.log(`| ${withColor('Reviewer'.padEnd(longestReviewer), 'cyan')} | ${withColor('Karma Score', 'cyan')} | ${withColor('% of Avg.', 'cyan')} |`);
  console.log(horizontalRule);
  sortableKarmaScores.forEach(([reviewer, karmaScore]) => {
    const reviewerText = withColor(reviewer.padEnd(longestReviewer), 'green');
    const scoreText = withColor(karmaScore.toString().padStart(longestScore + 7), 'yellow');
    const percentText = withColor(Math.trunc(100 * karmaScore / averageScore).toString().padStart(9), 'yellow');
    console.log(`| ${reviewerText} | ${scoreText} | ${percentText} |`);
  })
  console.log(horizontalRule);
  // console.log(`[DEBUG] Issued ${withColor(apiRequestCount, 'magenta')} github API requests, average score = ${averageScore}`);
}

async function main() {
  if (process.env.GITHUB_ACCESS_TOKEN) {
    octokit.authenticate({
      type: 'oauth',
      token: process.env.GITHUB_ACCESS_TOKEN,
    });
  } else {
    console.log('You must populate a github personal access token in the GITHUB_ACCESS_TOKEN env variable in order to use this script.');
    process.exit(1);
  }

  console.log(`Fetching all ${withColor(ORG_NAME, 'cyan')} org teams ...`);
  const teams = await paginate(
    octokit.teams.list,
    { org: ORG_NAME },
  );

  console.log(`Found ${withColor(teams.length, 'magenta')} org teams ...`);
  const teamIds = teams.filter(team => TEAM_NAMES.includes(team.name)).map(team => team.id);

  const usersPerTeamList = await Promise.all(teamIds.map(async (teamId) => {
    console.log(`Fetching ${withColor(teams.find(team => team.id === teamId).name, 'cyan')} team users ...`);
    return await paginate(
      octokit.teams.listMembers,
      {
        team_id: teamId,
        org: ORG_NAME,
      },
    );
  }));
  // flatten the per-team users arrays to a single array
  const teamUsers = shallowFlatten(usersPerTeamList);

  console.log(`Found ${withColor(teamUsers.length, 'magenta')} teams users ...`);
  const teamUserLogins = teamUsers.map(user => user.login);

  // seed the karma scores with 0 for each team member
  teamUserLogins.forEach(reviewer => {
    reviewerKarmaScores[reviewer] = 0;
  });

  // get repositories associated with github teams(s)
  const teamRepositories = shallowFlatten(
    await Promise.all(teamIds.map(async (teamId) => {
      console.log(`Fetching ${withColor(teams.find(team => team.id === teamId).name, 'cyan')} team repositories ...`);
      return await paginate(
        octokit.teams.listRepos,
        {
          team_id: teamId,
          org: ORG_NAME,
        },
      );
    }))
  ).map(repository => repository.name)
    .filter(uniqueFilter);

  const delayPromises = [];

  // fetch pull request data for each repository
  const repoPromises = teamRepositories.map(async (repository, repoIndex) => {
    console.log(`Fetching pull requests for repository ${withColor(repository, 'cyan')} ...`);

    const pullRequests = await paginate(
      octokit.search.issues,
      {
        q: `repo:${ORG_NAME}/${repository} is:pr merged:>=${mergedSinceDate.toISOString().slice(0, 10)} -author:optibot-cd`,
      }
    );
    
    pullRequests.forEach((pullRequest, prIndex) => {
      const delayPromise = (async () => {
        // add some variable latency to each batch of API requests to avoid trigerring github API abuse detection
        await timeout(5 + 10 * prIndex + 100 * repoIndex); 
    
        // console.log(`PR: ${pullRequest.title}`);
        const prQuery = {
          owner: ORG_NAME,
          repo: repository,
          number: pullRequest.number,
        };
        return [
          // API request to fetch file details for this pull request
          paginate(octokit.pullRequests.listFiles, prQuery),
          // API request to fetch reviews for this pull request
          paginate(octokit.pullRequests.listReviews, prQuery),
        ];
      })();
      delayPromises.push(delayPromise);
      return;
    });
    
  });

  await Promise.all(repoPromises);
  const promisePairs = await Promise.all(delayPromises);

  // Process each pull request for per-user code review karma
  const karmaPerPullRequestMaps = await Promise.all(promisePairs.map(async (promisePair) => {
    const [files, reviews] = await Promise.all(promisePair);
    const additionsReducer = (acc, file) => (acc + file.additions);
    const additionsKarma = filterFiles(files).reduce(additionsReducer, 0);
    const approvingReviewers = reviews
      .filter(review => review.state === 'APPROVED') // only credit reviewers that actually approved the PR
      .map(review => review.user.login)  // map the reviews to the reviewers' github account names
      .filter(uniqueFilter) // eliminate duplicate reviewers (if same user reviewed the PR mutiple times)
      .filter(reviewer => teamUserLogins.includes(reviewer)); // only consider reviews from users in the team we are analyzing

    // determine karma scores for this PR
    approvingReviewers.forEach((reviewer) => {
      const currentKarma = reviewerKarmaScores[reviewer] || 0;
      const updatedKarma = currentKarma + KARMA_PER_REVIEW + additionsKarma;
      reviewerKarmaScores[reviewer] = updatedKarma;
    });

    return;
  }));
  generateReport(karmaPerPullRequestMaps);
}

// kick off the main script execution function
main();
