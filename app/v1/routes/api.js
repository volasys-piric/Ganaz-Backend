var express = require('express');
var app = express();
var router = express.Router();
var express_jwt = require('express-jwt');

var appConfig = require('./../../app_config');

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
app.use('/projects', require('./api/project'));
app.use('/worksheet/weekly', require('./api/worksheetweekly'));

module.exports = app;
