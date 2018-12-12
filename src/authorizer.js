const request = require('request-promise')

module.exports = (code) => {
  const clientId = process.env.SLACK_CLIENT_ID
  const clientSecret = process.env.SLACK_CLIENT_SECRET

  const oauthURL = 'https://slack.com/api/oauth.access?' +
    'client_id=' + clientId + '&' +
    'client_secret=' + clientSecret + '&' +
    'code=' + code

  const options = {
    url: oauthURL,
    json: true,
  }

  return request(options)
    .then(response => response.access_token)
    .catch((error) => error)
}
