const twilio = require('twilio');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');

const twilio_client = twilio(appConfig.TWILIO_ACCOUNT_SID, appConfig.TWILIO_AUTH_TOKEN);

function _updateTwilioField(smsLog, response, exception) {
  const id = smsLog._id.toString();
  if (response) {
    logger.info('[Twilio Service] Smslog ' + id + ' successfully sent with response status ' + response.status + '.');
    response._context = undefined;
    response._solution = undefined;
    response._version = undefined;
    delete response._context;
    delete response._solution;
    delete response._version;
  } else if (exception) {
    logger.error('[Twilio Service] Failed to send smslog ' + id + '. Reason: ' + exception.message);
  }
  smsLog.twilio = {response: response, exception: exception};
  return smsLog.save();
}

module.exports = {
  sendMessage: function(smsLog) {
    const phoneNumber = smsLog.receiver.phone_number;
    const countryCode = phoneNumber.country_code ? phoneNumber.country_code : '1';
    const toFullNumber = '+' + countryCode + phoneNumber.local_number;
    const messageBody = smsLog.message;
    logger.info('[Twilio Service] Sending message to ' + toFullNumber + ' with smslog id ' + smsLog._id.toString() + ' with body ----> ' + messageBody);
    // Send asynchronously
    twilio_client.messages.create({
      from: appConfig.TWILIO_PHONE_NUMBER,
      to: toFullNumber,
      body: messageBody
    }).then(function(response) {
      _updateTwilioField(smsLog, response, null);
    }).catch(function(err) {
      _updateTwilioField(smsLog, null, err);
    });
  },
  sendMessages: function(smsLogs) {
    let sentMessageCount = 0;

    function sendSmsSerially(smsLogsToProcess, retryCount) {
      if (smsLogsToProcess.length > 0) {
        const smsLog = smsLogsToProcess.pop();
        const phoneNumber = smsLog.receiver.phone_number;
        const countryCode = phoneNumber.country_code ? phoneNumber.country_code : '1';
        const toFullNumber = '+' + countryCode + phoneNumber.local_number;
        const messageBody = smsLog.message;
        logger.info('[Twilio Service] ' + (++sentMessageCount) + '. Sending message to ' + toFullNumber + ' with smslog id ' + smsLog._id.toString() + ' with body ----> ' + messageBody);
        // Send asynchronously
        twilio_client.messages.create({
          from: appConfig.TWILIO_PHONE_NUMBER,
          to: toFullNumber,
          body: messageBody
        }).then(function(response) {
          _updateTwilioField(smsLog, response, null).then(function() {
            sendSmsSerially(smsLogsToProcess);
          });
        }).catch(function(err) {
          if (!retryCount) {
            retryCount = 1;
          }
          if (err.code === 20429 && retryCount < 3) {
            retryCount++;
            // Too Many Requests. See https://www.twilio.com/docs/api/errors/20429#error-20429
            logger.warn('[Twilio Service] Failed to send smslog ' + smsLog._id.toString() + '. Retrying...');
            smsLogsToProcess.push(smsLog);
            setTimeout(sendSmsSerially, 1500, smsLogsToProcess, retryCount); // Pause for 1.5s
          } else {
            _updateTwilioField(smsLog, null, err).then(function() {
              sendSmsSerially(smsLogsToProcess);
            });
          }
        })
      }
    }

    sendSmsSerially(smsLogs);
  }
};