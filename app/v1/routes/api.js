const express = require('express');
const app = express();
const router = express.Router();
const express_jwt = require('express-jwt');

const appConfig = require('./../../app_config');

const headerCheckerMiddleware = require('./../../../middlewares/headerChecker');

app.use('/', express_jwt({
  secret: appConfig.secret,
  credentialsRequired: true
}).unless(
  {
    path: [
      /\/status/,
      /\/admins\/login$/,
      /\/user\/login$/,
      /\/user\/search$/,
      /\/user\/bulksearch$/,
      /\/user\/search\/phones$/,
      /\/user\/password_recovery\/pin$/,
      /\/survey\/search/,
      /\/survey\/answer/,
      /\/survey\/answer\/search/,
      {
        url: /\/user$/,
        methods: 'POST'
      },
      {
        url: /\/user\/[0-9a-f]{8,}$/,
        methods: 'GET'
      },
      {
        url: /\/user\/onboarding\/[0-9a-f]{8,}$/,
        methods: 'PATCH'
      },
      {
        url: /\/company$/,
        methods: 'POST'
      },
      {
        url: /\/company\/[0-9a-f]{8,}$/,
        methods: 'GET'
      },
      /\/company\/search$/,
      /\/job\/search$/,
      /\/plans$/
    ]
  }
));
app.use('/', headerCheckerMiddleware);

router.get('/', function (req, res) {
  res.send('Hello! The API is now working');
});

app.use('/', router);
app.use('/admins', require('./api/admins'));
app.use('/user', require('./api/user'));
app.use('/company', require('./api/company'));
app.use('/job', require('./api/job'));
app.use('/message', require('./api/message'));
app.use('/application', require('./api/application'));
app.use('/recruit', require('./api/recruit'));
app.use('/plans', require('./api/membership'));
app.use('/invite', require('./api/invite'));
app.use('/review', require('./api/review'));
app.use('/support', require('./api/support'));
app.use('/suggest', require('./api/suggest'));
app.use('/survey', require('./api/survey'));
app.use('/survey/answer', require('./api/answer'));
module.exports = app;
