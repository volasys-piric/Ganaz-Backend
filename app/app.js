const express = require('express');
const logger = require('./utils/logger');
const bodyParser = require('body-parser');
const appConfig = require('./app_config');
logger.debug("Overriding 'Express' logger");
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
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
      msg: err.message
    });
  }
});

const base = express();
let root = appConfig.root;
root = root.endsWith('/') ? root.substring(0, root.length - 1) : root;
base.use(root, app);
module.exports = base;
