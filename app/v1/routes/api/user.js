const express = require('express');
const router = express.Router();

const httpUtil = require('./../../../utils/http');
const userService = require('./../service/user.service');

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.1%20User%20-%20Login
router.post('/login', function (req, res) {
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

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.2%20User%20-%20Signup
router.post('/', function (req, res) {
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
       "auth_type": "email/facebook/twitter/google/phone",
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

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.3%20User%20-%20Update%20Profile
router.patch('/', function (req, res) {
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
    userService.update(req.user._id, userDataUpdate).then(function (user) {
      res.json({
        success: true,
        account: user
      });
    }).catch(httpUtil.handleError(res));
  }
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.4%20User%20-%20Get%20User%20Details%20By%20Id
router.get('/:id', function (req, res) {
  userService.findById(req.params.id).then(function (user) {
    res.json({
      success: true,
      account: user
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.5%20User%20-%20Update%20Company%20User%20Role
router.patch('/:id/type', function (req, res) {
  /** Expected req.body
   {
       "type": "company-admin/company-regular"
   }
   */
  const body = req.body;
  if (body.type !== 'company-admin' && body.type !== 'company-regular') {
    res.json({
      success: false,
      msg: 'Request body type is not acceptable.'
    });
  } else {
    userService.updateType(req.user._id, req.params.id, body.type).then(function (user) {
      res.json({
        success: true,
        account: user
      });
    }).catch(httpUtil.handleError(res));
  }
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.6%20User%20-%20Search
router.post('/search', function (req, res) {
  /** Expected req.body is
   {
       "type": "worker/company-admin/company-regular",
       "email_address": "{email address}",     [optional]
       "firstname": "{first name}",            [optional]
       "lastname": "{last name}",          [optional]
       "phone_number": "123456789",            [optional]
           "company_id": "{company id}",                   [optional]
       "any": "any keyword"                [optional]
   }
   */
  const body = req.body;
  userService.search(body).then(function (users) {
    res.json({
      success: true,
      users: users
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.7%20User%20-%20Bulk%20Search%20By%20Phone%20Numbers
router.post('/search/phones', function (req, res) {
  /** Expected req.body is
   {
       "phone_numbers": [
           "1234567890",
           "1234567891",
          ...
       ]
   }
   */
  const phoneNumbers = req.body && req.body.phone_numbers ? req.body.phone_numbers : [];
  userService.searchPhones(phoneNumbers).then(function (users) {
    res.json({
      success: true,
      users: users
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/password_recovery/pin', function (req, res) {
  /** Expected req.body is
   {
       "username": "{username}"
   }
   */
  const body = req.body;
  userService.recoverPassRequestPin(body.username).then(function (recovery) {
    res.json({
      success: true,
      recovery: recovery
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/password_recovery/reset', function (req, res) {
  /** Expected req.body is
   {
       "password": "{new password}"
   }
   */
  const body = req.body;
  userService.updatePassword(req.user._id, body.password).then(function (user) {
    res.json({
      success: true,
      account: user
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;