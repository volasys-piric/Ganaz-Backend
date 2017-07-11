const request = require('request');
const appConfig = require('./app_config');

const sendNotification = function (device, notification) {
  const request_body = JSON.stringify({
    'app_id': appConfig.ONE_SIGNAL_API_ID,
    'contents': notification.contents,
    'data': notification.data,
    'ios_badgeType': 'Increase',
    'ios_badgeCount': 1,
    'include_player_ids': Array.isArray(device) ? device : [device]
  });

  request.post({
      url: 'https://onesignal.com/api/v1/notifications',
      headers: {
        'Content-Length': Buffer.byteLength(request_body),
        'authorization': 'Basic ' + appConfig.ONE_SIGNAL_API_KEY,
        'content-type': 'application/json'
      },
      body: request_body
    }, function (error, response, body) {
      if (!error) {
        console.log(body);
      } else {
        console.error('Error:', error);
      }
    }
  )
};

module.exports = sendNotification;