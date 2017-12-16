const express = require('express');
const router = express.Router();

const httpUtil = require('./../../../utils/http');
const db = require('./../../db');

const InboundSms = db.models.inboundSms;
const User = db.models.user;
const Company = db.models.company;

const _parseE164Number = function (num) {
  const o = {country_code: '', local_number: num};
  // See https://www.twilio.com/docs/api/twiml/sms/twilio_request#phone-numbers
  if (num.startsWith('+')) {
    num = num.substring(1);
    if (num.length > 10) {
      o.country_code = num.charAt(0);
      o.local_number = num.substr(num.length - 10);
    }
  }
  return o;
};

// https://bitbucket.org/volasys-ss/ganaz-backend/issues/25/twilio-webhook-for-inbound-message
router.post('/inbound', function (req, res) {
  const body = req.body;
  const fromPhone = _parseE164Number(body.From);
  const toPhone = _parseE164Number(body.To);
  
  const inboundSms = new InboundSms({request: body});
  
  
  res.send("<Response><Message>Message received.</Message></Response>");
});

module.exports = router;