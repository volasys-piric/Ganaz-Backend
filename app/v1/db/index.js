const Promise = require('bluebird');
const appConfig = require('./../app_config');

const mongoose = require('mongoose');
mongoose.Promise = Promise;
mongoose.connect(appConfig.dbUrl);

module.exports = {
  models: {
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
    user: require('./models/user')
  }
};