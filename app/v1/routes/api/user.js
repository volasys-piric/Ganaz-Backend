var express = require('express');
var router = express.Router();

var httpUtil = require('./../../../utils/http');
var userService = require('./../service/user.service');

router.post('/', function (req, res, next) {
  /** Expected req.body is
   {
       "type": "worker/company-regular/company-admin",
       "firstname": "{first name}",
       "lastname": "{last name}",
       "username": "{user login name}",
       "email_address": "{email address}",
       "phone_number": {
           "country": "US",
           "country_code": "1",
           "local_number": "{local number}"
       },
       "auth_type": "email/facebook/twitter/google",
       "external_id": "{facebook_user_id/twitter_user_id/google_user_id}",
       "player_ids": [
           "{onesignal_player_id}",
           "{onesignal_player_id}",
           ...
       ],

       "worker": {                                          [optional]
           "location": {
               "address": "{address}",
               "lat": "{latitude}",
               "lng": "{longitude}"
           },
           "is_newjob_lock": "true/false",
       },

       "company": {                                          [optional]
           "company_id": "{company_id}"
       }
   }
   */
  var body = req.body;
  var isValid = function (body) {
    return body && body.username && body.firstname && body.lastname
      && body.type && (
        body.type === 'worker' || (
          (body.type === 'company-regular' || body.type === 'company-admin')
          && body.company && body.company.company_id
        )
      )
      && body.auth_type && (
        body.email !== 'email'
        || body.password // Should have password if authentication by email
      )
  };
  if (isValid(body)) {
    userService.create(body).then(function (user) {
      res.json({
        success: true,
        account: user
      });
    }).catch(httpUtil.handleError(res));
  } else {
    res.json({success: false, msg: 'Please recheck if omitted things exist.'});
  }
});

router.patch('/', function (req, res, next) {
  /** Expected req.body is
   {
       "account": {
           "firstname": "{first name}",                        [optional]
           "lastname": "{last name}",                          [optional]
           "email_address": "{email address}",                 [optional]
           "phone_number": {                                   [optional]
               "country": "US",
               "country_code": "1",
               "local_number": "{local number}"
           },
           "player_ids": [                                      [optional]
               "{onesignal_player_id}",
               "{onesignal_player_id}",
               ...
           ],
           "worker": {                                         [optional]
               "location": {                                   [optional]
                   "address": "{address}",
                   "lat": "{latitude}",
                   "lng": "{longitude}"
               },
               "is_newjob_lock": "true/false",                 [optional]
           },
       }
   }
   */
});

router.post('/login', function (req, res, next) {
  /** Expected req.body is
   {
       "username": "{username}",                           [optional]
       "password": "{password}",                           [optional]
       "auth_type": "email/facebook/google/twitter",
       "external_id": ""                                   [optional]
   }
   */
  var body = req.body;
  var errorMessage = null;
  if (!body || !body.username || !body.auth_type) {
    errorMessage = 'Request body username, auth_type are required.';
  } else if (body.auth_type === 'email') {
    if (!body.password) {
      errorMessage = 'Request body password is required for auth_type email.';
    }
  } else if (!body.external_id) {
    errorMessage = 'Request body external_id is required for auth_type ' + body.auth_type + '.';
  }

  if (!errorMessage) {
    userService.login(body).then(function (user) {
      res.json({
        success: true,
        account: user
      });
    }).catch(httpUtil.handleError(res));
  } else {
    res.json({
      success: false,
      msg: errorMessage
    });
  }
});

module.exports = router;