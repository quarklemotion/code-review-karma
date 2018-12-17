const fetchGithubDataAndBuildReport = require('../fetchGithubDataAndBuildReport');

/*
 * This script uses the github API to inspect recently merged and reviewed pull requests
 * to generate a report showing the `Code Review Karma` score for each member of the
 * github team.
 *
 * Usage:
 * >export GITHUB_ACCESS_TOKEN=xyz123
 * >export GITHUB_ORG=myOrg
 * >export GITHUB_TEAMS=team1,team2
 * >node ./src/scripts/code-review-karma-report.js
 */
const KARMA_PER_REVIEW = 50; // karma each user gets per review
const KARMA_PERCENT_PER_COMMENT = 25; // percentage of added lines karma given to PR commenters
const DAYS_TO_REPORT = 30; // can override using `export DAYS_TO_REPORT=7`

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
  const horizontalRule = `--${''.padEnd(longestReviewer, '-')}----------------------------`;
  console.log(horizontalRule);
  console.log(`| ${withColor('Reviewer'.padEnd(longestReviewer), 'cyan')} | ${withColor('Karma Score', 'cyan')} | ${withColor('% of Avg.', 'cyan')} |`);
  console.log(horizontalRule);
  karmaReportArrays.forEach(([reviewer, karmaScore, percentOfAverage]) => {
    const reviewerText = withColor(reviewer.padEnd(longestReviewer), 'green');
    const scoreText = withColor(karmaScore.toString().padStart(11), 'yellow');
    const percentText = withColor(percentOfAverage.toString().padStart(9), 'yellow');
    console.log(`| ${reviewerText} | ${scoreText} | ${percentText} |`);
  })
  console.log(horizontalRule);
}

// perform basic validation to ensure the appropriate environment vars are populated
let validationFailure = false;
if (!process.env.GITHUB_ACCESS_TOKEN) {
  console.log(`You must populate a github personal access token in the ${withColor('GITHUB_ACCESS_TOKEN', 'cyan')} env variable in order to use this script.`);
  validationFailure = true;
}

if (!process.env.GITHUB_ORG) {
  console.log(`You must populate a github organization name in the ${withColor('GITHUB_ORG', 'cyan')} env variable in order to use this script.`);
  validationFailure = true;
}

if (!process.env.GITHUB_TEAMS) {
  console.log(`You must populate one or more comma-separated github team names in the ${withColor('GITHUB_TEAMS', 'cyan')} env variable in order to use this script.`);
  validationFailure = true;
}
if (validationFailure) {
  process.exit(1);
}

const teams = process.env.GITHUB_TEAMS.split(',');
const displayTeams = withColor(teams.join(', '), 'cyan');
const organization = withColor(process.env.GITHUB_ORG, 'cyan');
console.log(
  `Calculating ${withColor('Code Review Karma', 'cyan')} report for team${ teams.length > 1 ? 's' : '' }:\n` +
  `${displayTeams} in the ${organization} github org.`
);

const daysToReport = process.env.DAYS_TO_REPORT ? Number(process.env.DAYS_TO_REPORT) : DAYS_TO_REPORT;

// kick off the main function to fetch data from github and generate the code review karma report
fetchGithubDataAndBuildReport({
  githubAccessToken: process.env.GITHUB_ACCESS_TOKEN,
  logger: console.log,
  githubOrg: process.env.GITHUB_ORG,
  githubTeams: process.env.GITHUB_TEAMS,
  daysToReport,
  karmaPerReview: KARMA_PER_REVIEW,
  karmaPercentPerComment: KARMA_PERCENT_PER_COMMENT,
}).then(([karmaReportData, statistics]) => {
  console.log(`Report based on ${withColor(statistics.pullRequestCount, 'cyan')} reviewed pull requests over the past ${withColor(daysToReport, 'cyan')} days.`)
  // display the karma report to the console
  displayConsoleReport(karmaReportData);
  const displayOmitted = statistics.omittedUsers.map(user => withColor(user, 'cyan')).join(', ');
  if (statistics.omittedUsers.length > 0) {
    console.log(`Excluded from report due to no review activity: ${displayOmitted}`);
  }
});



