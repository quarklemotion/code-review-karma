module.exports = function (slackResponseBody) {
  return decodeURIComponent(slackResponseBody)
    .split('&')
    .map(field => field.split('='))
    .reduce((index, pair) => {
      if (pair[0] === 'text') { // Any text after slash command
        const github = pair[1].replace(/[+]/g, '') // Spaces are converted to '+'
          .split(/[-]{2}/g)
          .slice(1) // Remove empty string created from split
          .map(entry => entry.split(':'))
          .reduce((obj, pair) => {
            obj[pair[0]] = pair[1]
            return obj
          }, {})
        index['githubOrg'] = github.org || process.env.GITHUB_ORG
        index['githubTeams'] = github.teams || process.env.GITHUB_TEAMS
        index['daysToReport'] = process.env.DAYS_TO_REPORT || 30
        index['karmaPerReview'] = process.env.KARMA_PER_REVIEW || 50
        index['karmaPercentPerComment'] = process.env.KARMA_PERCENT_PER_COMMENT || 25
      } else {
        index[pair[0]] = pair[1]
      }
      return index
    }, {})
}
