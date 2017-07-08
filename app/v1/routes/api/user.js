const express = require('express');
const router = express.Router();

const httpUtil = require('./../../../utils/http');
const userService = require('./../service/user.service');

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
  const body = req.body;
  if (!body) {
    res.json({success: false, msg: 'Request body not found.'});
  } else {
    userService.validate(body).then(function () {
      return userService.create(body);
    }).then(function (user) {
      res.json({
        success: true,
        account: user
      });
    }).catch(httpUtil.handleError(res));
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
  const body = req.body;
  if (!body || !body.account) {
    res.json({success: false, msg: 'Request body of form {"account": {... user body ...} } not found.'});
  } else {
    const userDataUpdate = body.account;
    userService.validate(userDataUpdate).then(function () {
      return userService.update(userDataUpdate);
    }).then(function (user) {
      res.json({
        success: true,
        account: user
      });
    }).catch(httpUtil.handleError(res));
  }
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
  const body = req.body;
  let errorMessage = null;
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