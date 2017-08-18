const request = require('request');
const appConfig = require('./app_config');
const logger = require('./utils/logger');

const sendNotification = function (device, notification) {
  let includePlayerIds = [];
  if (Array.isArray(device)) {
    includePlayerIds = device;
  } else if (device && typeof device === 'string') {
    includePlayerIds.push(device);
  }
  if (includePlayerIds.length > 0) {
    const request_body = JSON.stringify({
      'app_id': appConfig.ONE_SIGNAL_API_ID,
      'contents': notification.contents,
      'data': notification.data,
      'ios_badgeType': 'Increase',
      'ios_badgeCount': 1,
      'include_player_ids': includePlayerIds
    });

    logger.info('[Push Notification] Sending body ----> ' + request_body);
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
          logger.info('[Push Notification] Success Response: ' + body);
        } else {
          logger.warn('[Push Notification] Error Response: ' + error);
        }
      }
    )
  } else {
    logger.info('[Push Notification] Not sending. Cause: Empty player ids. Body ----> ' + JSON.stringify(notification));
  }
};

module.exports = sendNotification;