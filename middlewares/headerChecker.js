const express = require('express');
const router = express.Router();
const appConfig = require('./../app/app_config');

const excludedPaths = ['/sms/inbound'];
// a middleware function with no mount path. This code is executed for every request to the router
router.use(function (req, res, next) {
  /**
   * See https://bitbucket.org/volasys-ss/ganaz-backend/issues/3/check-app-version-and-reject-api-requests
   HEADER:
   platform: android / ios / web / admin [optional]
   client: iOS 10.3.5 iPhone 7 [optional]
   version: 1.1
   build: 1025 [optional]
   */
  const version = parseFloat(req.header('version'));
  const path = req.path;
  if (excludedPaths.indexOf(path) === -1) {
    if (!version) {
      res.status(403).json({
        success: false,
        msg: 'No Header with name "version" found.'
      })
    } else if (version < 1 || version > appConfig.version) {
      res.status(403).json({
        success: false,
        msg: 'Header version ' + version + ' not acceptable.'
      })
    } else {
      req.api_version = version;
      next()
    }
  } else {
    req.api_version = appConfig.version;
    next()
  }
});

module.exports = router;
