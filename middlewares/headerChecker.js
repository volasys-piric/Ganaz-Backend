import express from "express";
const app = express();
const router = express.Router();

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
  const version = req.header('version');
  if (version !== '1.0' && version !== '1.1') {
    res.status(403).json({
      success: false,
      message: 'Header version ' + version + ' not acceptable.'
    })
  } else {
    next()
  }
});

export default router;
