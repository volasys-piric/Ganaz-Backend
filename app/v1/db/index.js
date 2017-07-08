var Promise = require('bluebird');
var appConfig = require('./../app_config');

var mongoose = require('mongoose');
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
    payments: require('./models/payments'),
    recruit: require('./models/recruit'),
    review: require('./models/review'),
    user: require('./models/user')
  }
};