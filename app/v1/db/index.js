const Promise = require('bluebird');
const appConfig = require('./../../app_config');

const mongoose = require('mongoose');
mongoose.Promise = Promise;
mongoose.connect(appConfig.dbUrl);

const fb = require('./models/fb');
module.exports = {
  models: {
    admin: require('./models/admin'),
    application: require('./models/application'),
    company: require('./models/company'),
    crew: require('./models/crew'),
    invite: require('./models/invite'),
    job: require('./models/job'),
    membership: require('./models/membership'),
    message: require('./models/message'),
    myworker: require('./models/myworker'),
    paymentMethod: require('./models/payments').PaymentMethod,
    paymentHistory: require('./models/payments').PaymentHistory,
    recruit: require('./models/recruit'),
    review: require('./models/review'),
    user: require('./models/user'),
    suggest: require('./models/suggest'),
    smslog: require('./models/smslog'),
    survey: require('./models/survey'),
    answer: require('./models/answer'),
    twiliophone: require('./models/twiliophone'),
    inboundSms: require('./models/inboundSms'),
    fbwebhook: fb.webhook,
    fbmessage: fb.message,
    fbpageinfo: fb.pageinfo,
  },
  schema: {
    phonenumber: require('./schema/phonenumber')
  }
};