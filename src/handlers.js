const authorizer = require('./authorizer')
const request = require('request-promise')
const fetchGithubDataAndBuildReport = require('./fetchGithubDataAndBuildReport')
const formatReportForSlack = require('./formatReportForSlack')

module.exports.authorization = (event, context, callback) => {
  const { code } = event.queryStringParameters

  authorizer(code)
    .then((token) => {
      callback(null, {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Authorization was called',
          token,
          event,
          context,
        }),
      })
    })
    .catch(error => {
      callback(null, {
        statusCode: 500,
        body: JSON.stringify({
          message: error,
          input: event,
        }),
      })
    })
}

module.exports.report = (event, context, callback) => {
  // Confirm message was received
  let promise = new Promise (resolve => {
    callback(null, {
      statusCode: 200,
      body: {
        text: 'Generating the karma report...'
      },
    })

    // Parse the urlencoded body for the response_url
    const payload = decodeURIComponent(event.body)
      .split('&')
      .map(field => field.split('='))
      .reduce((index, pair) => {
        index[pair[0]] = pair[1]
        return index
      }, {})
    resolve(payload)
  })

  const KARMA_PER_REVIEW = 50
  const KARMA_PERCENT_PER_COMMENT = 25
  const DAYS_TO_REPORT = 30
  promise.then(payload => {
      return Promise.all([
        fetchGithubDataAndBuildReport({
          githubAccessToken: process.env.GITHUB_ACCESS_TOKEN,
          logger: () => {},
          githubOrg: process.env.GITHUB_ORG,
          githubTeams: process.env.GITHUB_TEAMS,
          daysToReport: DAYS_TO_REPORT,
          karmaPerReview: KARMA_PER_REVIEW,
          karmaPercentPerComment: KARMA_PERCENT_PER_COMMENT,
        }),
        payload
      ])
    })
  .then(([response, payload]) => {
    const text = formatReportForSlack(response, DAYS_TO_REPORT)
    return request({
      method: 'POST',
      headers: {
        'Content-type': 'application/json'
      },
      uri: payload.response_url,
      json: true,
      body: {
        "response_type": "in_channel",
        "text": text,
      },
    })
  })
  .then(() => {
    console.log('Request successful')
  })
  .catch(error => {
    console.log('Error sending message', error)
  })
}
