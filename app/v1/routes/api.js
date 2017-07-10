const express = require('express');
const app = express();
const router = express.Router();
const express_jwt = require('express-jwt');

const appConfig = require('./../../app_config');

app.use('/', express_jwt({
  secret: appConfig.secret,
  credentialsRequired: true
}).unless(
  {
    path: [
      /\/status/,
      /\/user$/,
      /\/user\/login$/
    ]
  }
));

router.get('/', function (req, res) {
  res.send('Hello! The API is now working');
});
app.use('/', router);
app.use('/user', require('./api/user'));
app.use('/company', require('./api/company'));
app.use('/job', require('./api/job'));
app.use('/message', require('./api/message'));
app.use('/application', require('./api/application'));
app.use('/recruit', require('./api/recruit'));
app.use('/plans', require('./api/membership'));
app.use('/invite', require('./api/invite'));
app.use('/review', require('./api/review'));
module.exports = app;
