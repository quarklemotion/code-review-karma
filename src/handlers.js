const authorizer = require('./authorizer')
const request = require('request-promise')
const fetchGithubDataAndBuildReport = require('./fetchGithubDataAndBuildReport')
const formatReportForSlack = require('./formatReportForSlack')
const parseSlackPayload = require('./parseSlackPayload')

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
  callback(null, { statusCode: 200 })

  // Parse response from Slack and add defaults
  const payload = parseSlackPayload(event.body)

  request({
    method: 'POST',
    headers: {
      'Content-type': 'application/json'
    },
    uri: payload.response_url,
    json: true,
    statusCode: 200,
    body: {
      "response_type": "in_channel",
      "text": 'Generating karma report...',
    },
  })
  .then(() => {
    return Promise.all([
      fetchGithubDataAndBuildReport({
        githubAccessToken: process.env.GITHUB_ACCESS_TOKEN,
        logger: () => {},
        githubOrg: payload.githubOrg,
        githubTeams: payload.githubTeams,
        daysToReport: payload.daysToReport,
        karmaPerReview: payload.karmaPerReview,
        karmaPercentPerComment: payload.karmaPercentPerComment,
      }),
      payload
    ])
  })
  .then(([response, payload]) => {
    const text = formatReportForSlack(response, payload)
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
