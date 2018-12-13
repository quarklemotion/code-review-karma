module.exports = function displayConsoleReport([karmaReportArrays, statistics], daysToReport) {
  const teams = process.env.GITHUB_TEAMS.split(',').join(', ')
  const organization = process.env.GITHUB_ORG

  const longestReviewer = Math.max(12, ...karmaReportArrays.map(karmaScore => karmaScore[0].length));
  const longestScore = Math.max(...karmaReportArrays.map(karmaScore => karmaScore[1].toString().length));
  const horizontalRule = `--${''.padEnd(longestReviewer, '-')}----------------------------\n`;

  const title = `Code Review Karma report for team(s):\n${teams} in the ${organization} github org\n`
  const subtitle = `based on ${statistics.pullRequestCount} reviewed pull requests over the past ${daysToReport} days:\n`

  const report = "\n```" +
    title +
    subtitle +
    horizontalRule +
    `| ${'Reviewer'.padEnd(longestReviewer)} | Karma Score | % of Avg. |\n` +
    horizontalRule +
    karmaReportArrays.map(([reviewer, karmaScore, percentOfAverage]) => {
      const reviewerText = reviewer.padEnd(longestReviewer)
      const scoreText = karmaScore.toString().padStart(longestScore + 7)
      const percentText = percentOfAverage.toString().padStart(9)
      return `| ${reviewerText} | ${scoreText} | ${percentText} |\n`
    }).join('') +
    horizontalRule +
    "```\n"

  return report
}
