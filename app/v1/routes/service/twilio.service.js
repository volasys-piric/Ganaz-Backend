const twilio = require('twilio');
const appConfig = require('./../../../app_config');

const twilio_client = twilio(appConfig.TWILIO_ACCOUNT_SID, appConfig.TWILIO_AUTH_TOKEN);

module.exports = {
  sendMessage: function (toFullNumber, body) {
    return twilio_client.messages.create({
      from: appConfig.TWILIO_PHONE_NUMBER,
      to: toFullNumber,
      body: body
    });
  }
};