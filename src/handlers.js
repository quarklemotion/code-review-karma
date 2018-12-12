const authorizer = require('./authorizer')
const request = require('request-promise')

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
  // Also possible to notify user that karma report is being generated
  callback(null, { statusCode: 200 })

  // Parse the urlencoded body for the response_url
  const payload = decodeURIComponent(event.body)
    .split('&')
    .map(field => field.split('='))
    .reduce((index, pair) => {
      index[pair[0]] = pair[1]
      return index
    }, {})

  request({
    method: 'POST',
    headers: {
      'Content-type': 'application/json'
    },
    uri: payload.response_url,
    json: true,
    body: {
      // This is where the karma report would go
      text: 'This message was sent later'
    }
  })
  .then(() => {
    console.log('Request successful')
  })
  .catch(error => {
    console.log('Error sending message', error)
  })
}
