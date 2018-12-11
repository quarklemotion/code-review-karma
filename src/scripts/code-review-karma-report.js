const fetchGithubDataAndBuildReport = require('../fetchGithubDataAndBuildReport');

/*
 * This script uses the github API to inspect recently merged frontend pull requests
 * to determine the percentage of these pull requests that touch Vue components.
 *
 * Usage:
 * >export GITHUB_ACCESS_TOKEN=xyz123
 * >node ./src/scripts/code-review-karma-report.js
 */
const KARMA_PER_REVIEW = 50; // karma each user gets per review
const KARMA_PERCENT_PER_COMMENT = 30; // percentage of added lines karma given to PR commenters
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

/**
 * Render text with specified color on the terminal
 * @param {string} string 
 * @param {string} color 
 */
function withColor(string, color) {
  return `${colors[color]}${string}${colors.default}`;
}

/**
 * Display the Code Review Karma report to the console
 * @param {Object} karmaReportArrays 
 */
function displayConsoleReport(karmaReportArrays) {
  const longestReviewer = Math.max(12, ...karmaReportArrays.map(karmaScore => karmaScore[0].length));
  const longestScore = Math.max(...karmaReportArrays.map(karmaScore => karmaScore[1].toString().length));
  const horizontalRule = `--${''.padEnd(longestReviewer, '-')}----------------------------`;
  console.log(horizontalRule);
  console.log(`| ${withColor('Reviewer'.padEnd(longestReviewer), 'cyan')} | ${withColor('Karma Score', 'cyan')} | ${withColor('% of Avg.', 'cyan')} |`);
  console.log(horizontalRule);
  karmaReportArrays.forEach(([reviewer, karmaScore, percentOfAverage]) => {
    const reviewerText = withColor(reviewer.padEnd(longestReviewer), 'green');
    const scoreText = withColor(karmaScore.toString().padStart(longestScore + 7), 'yellow');
    const percentText = withColor(percentOfAverage.toString().padStart(9), 'yellow');
    console.log(`| ${reviewerText} | ${scoreText} | ${percentText} |`);
  })
  console.log(horizontalRule);
}

if (!process.env.GITHUB_ACCESS_TOKEN) {
  console.log('You must populate a github personal access token in the GITHUB_ACCESS_TOKEN env variable in order to use this script.');
  process.exit(1);
}

console.log(`Calculating Code Review Karma report for team(s): ${withColor(TEAM_NAMES.split(',').join(', '), 'cyan')} in the ${withColor(ORG_NAME, 'cyan')} org ...`)

// kick off the main function to fetch data from github and generate the code review karma report
fetchGithubDataAndBuildReport({
  githubAccessToken: process.env.GITHUB_ACCESS_TOKEN,
  logger: console.log,
  githubOrg: ORG_NAME,
  githubTeams: TEAM_NAMES,
  daysToSearch: DAYS_TO_SEARCH,
  karmaPerReview: KARMA_PER_REVIEW,
  karmaPercentPerComment: KARMA_PERCENT_PER_COMMENT,
}).then(([karmaReportData, statistics]) => {
  console.log(`Code Review Karma report based on ${withColor(statistics.pullRequestCount, 'cyan')} reviewed pull requests over ${withColor(DAYS_TO_SEARCH, 'cyan')} days.`)
  // display the karma report to the console
  displayConsoleReport(karmaReportData);
});



