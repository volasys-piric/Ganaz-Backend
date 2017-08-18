const request = require('request');
const appConfig = require('./app_config');
const logger = require('./utils/logger');

const sendNotification = function (device, notification) {
  let includePlayerIds = [];
  if (device) {
    if (Array.isArray(device)) {
      includePlayerIds = device;
    } else {
      includePlayerIds.push(device);
    }
    const request_body = JSON.stringify({
      'app_id': appConfig.ONE_SIGNAL_API_ID,
      'contents': notification.contents,
      'data': notification.data,
      'ios_badgeType': 'Increase',
      'ios_badgeCount': 1,
      'include_player_ids': includePlayerIds
    });

    logger.info('Sending push notification with body ----> ' + request_body);
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
  } else {
    logger.info('Sending push notification with notification body ----> ' + JSON.stringify(notification));
  }
};

module.exports = sendNotification;