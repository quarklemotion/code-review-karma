module.exports = ([karmaReportArrays, statistics], payload) => {
  const teams = payload.githubTeams.split(',');
  const organization = payload.githubOrg;
  const days = payload.daysToReport

  const displayTeams = teams.join(', ');
  const longestReviewer = Math.max(12, ...karmaReportArrays.map(karmaScore => karmaScore[0].length));
  const longestScore = Math.max(...karmaReportArrays.map(karmaScore => karmaScore[1].toString().length));
  const horizontalRule = `--${''.padEnd(longestReviewer, '-')}----------------------------\n`;

  const title = `Code Review Karma report for team${ teams.length > 1 ? 's' : '' }:\n` +
    `*${displayTeams}* in the *${organization}* github org.\n`
  const subtitle = `Report based on *${statistics.pullRequestCount}* reviewed pull requests over the past *${days}* days:\n`

  const report = "\n" +
    title +
    subtitle +
    '```\n' +
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
