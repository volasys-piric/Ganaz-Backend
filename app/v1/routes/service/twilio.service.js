const twilio = require('twilio');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
const db = require('./../../db');

const Smslog = db.models.smslog;
const twilio_client = twilio(appConfig.TWILIO_ACCOUNT_SID, appConfig.TWILIO_AUTH_TOKEN);

module.exports = {
  sendMessage: function (senderUserId, senderCompanyId, phoneNumber, messageBody, billable) {
    const countryCode = phoneNumber.country_code ? phoneNumber.country_code : '1';
    const toFullNumber = '+' + countryCode + phoneNumber.local_number;
    const smsLog = new Smslog({
      sender: {sender_id: senderUserId, company_id: senderCompanyId},
      receiver: {phone_number: phoneNumber}
    });
    if (billable !== undefined && typeof billable === 'boolean') {
      smsLog.billable = billable;
    }
    return smsLog.save().then(function (smsLog) {
      // Send asynchronously
      logger.info('Sending message to ' + toFullNumber + ' with body ----> ' + messageBody);
      twilio_client.messages.create({
        from: appConfig.TWILIO_PHONE_NUMBER,
        to: toFullNumber,
        body: messageBody
      }).then(function (response) {
        smsLog.twilio = {
          response: response
        };
        smsLog.save();
      }).catch(function (err) {
        smsLog.twilio = {
          exception: err
        };
        smsLog.save();
      });
      return null;
    });
  }
};