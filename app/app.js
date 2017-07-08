var express = require('express');
var logger = require('./utils/logger');
var bodyParser = require('body-parser');
var appConfig = require('./app_config');
logger.debug("Overriding 'Express' logger");
var isProduction = process.env.NODE_ENV === 'production';

var app = express();
app.use(require('morgan')(isProduction ? 'common' : 'dev', {'stream': logger.stream}));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended: false}));

app.use('/api/v1', require('./v1/routes/api'));

app.use(function (err, req, res, next) {
  logger.error(err);
  if (err.name === 'UnauthorizedError') {
    if (err.message === 'jwt expired') {
      res.status(403).json({message: 'Token expired'});
    } else {
      res.status(403).json({message: err.message});
    }
  } else {
    res.status(err.status || 500).json({
      success: false,
      message: err.message
    });
  }
});

var base = express();
var root = appConfig.root;
root = root.endsWith('/') ? root.substring(0, root.length - 1) : root;
base.use(root, app);
module.exports = base;
