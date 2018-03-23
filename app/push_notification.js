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

    logger.info(`[Push Notification] Do send request body ----> ${request_body}`);
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
    logger.info(`[Push Notification] Not sending. Cause: Empty player ids. Body ----> ${JSON.stringify(notification)}`);
  }
};

const sendMessage = function (player_ids, savedMessage, preferES) {
  const o = savedMessage.toObject();
  logger.info(`[Push Notification] Sending message ${JSON.stringify(savedMessage)}`);
  let messageString = null;
  let messageObject = null;
  if (o.sender.company_id && o.auto_translate === true) {
      if (!preferEN || preferEN == false) {
          messageString = o.message.en;
          messageObject = {en: messageString, es: messageString};
      }
      else {
          messageString = o.message.es;
          messageObject = {en: messageString, es: messageString};
      }
  } else if (typeof o.message === 'object') {
      if (!preferEN || preferEN == false) {
          messageString = o.message.en ? o.message.en : o.message.es;
          messageObject = {en: messageString};
      }
      else {
          messageString = o.message.es ? o.message.es : o.message.en;
          messageObject = {en: messageString};
      }
  } else {
      // Assumed to be string
      if (!preferEN || preferEN == false) {
          messageString = o.message;
          messageObject = {en: messageString};
      }
      else {
          messageString = o.message;
          messageObject = {en: messageString};
      }
  }
  const messageId = o._id.toString();
  const data = {type: o.type};
  data.contents = {
    id: messageId,
    message_id: messageId,
    message: messageString,
  };
  if (o.job_id) {
    // For backward compatibility
    data.contents.job_id = o.job_id
  }
  if (o.type === 'application') {
    data.contents.application_id = o.metadata.application_id;
  } else if (o.type === 'recruit') {
    data.contents.recruit_id = o.metadata.recruit_id;
  } else if (o.type === 'suggest') {
    data.contents.suggest_id = o.metadata.suggest_id;
    data.contents.suggested_phone_number = o.metadata.suggested_phone_number;
  } else if (o.type === 'survey-answer') {
    data.contents.survey_id = o.metadata.survey.survey_id;
    data.contents.answer_id = o.metadata.survey.answer_id;
  } else if (o.type === 'survey-choice-single' || o.type === 'survey-open-text') {
    data.contents.survey_id = o.metadata.survey.survey_id;
  } else if (o.metadata) {
    if (o.metadata.is_from_sms) {
      data.contents.is_from_sms = o.metadata.is_from_sms;
    }
  }
  sendNotification(player_ids, {contents: messageObject, data: data});
};

module.exports = {
  sendNotification: sendNotification,
  sendMessage: sendMessage
};
