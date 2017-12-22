const Promise = require('bluebird');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const bcrypt = require('bcrypt-nodejs');
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
const httpUtil = require('./../../../utils/http');
const twiliophoneService = require('./../service/twiliophone.service');

const Admin = db.models.admin;
const Myworker = db.models.myworker;
const User = db.models.user;
const Smslog = db.models.smslog;

router.post('/login', function (req, res) {
  // find the user
  const username = req.body.username;
  Admin.findOne({username: username}).then(function (model) {
    if (!model) {
      res.json({success: false, message: 'Authentication failed. User not found.'});
    } else {
      // check if password matches
      if (req.body.password !== model.password && // Ganaz-Admin may pass encrypted password
        !bcrypt.compareSync(req.body.password, model.password)) {
        res.json({success: false, message: 'Authentication failed. Wrong password.'});
      } else {
        // if user is found and password is right
        // create a token
        const user = model.toJSON();
        user.admin = true;
        user.password = undefined;
        delete user.password;
        const token = jwt.sign(user, appConfig.secret, {
          expiresIn: '1d' // expires in 1 day. See https://github.com/auth0/node-jsonwebtoken#user-content-usage for possible values
        });
        // return the information including token as JSON
        res.json({
          success: true,
          message: 'Don\'t loose the token!',
          token: 'Bearer ' + token
        });
      }
    }
  }, function (error) {
    logger.error(error);
    res.status(500).send({msg: "Internal Error in getting companies"});
  });
});

router.post('/myworker/:id/sendSms', function (req, res) {
  const adminUser = req.user;
  if(!adminUser.admin) {
    res.status(403);
  } else {
    const body = req.body;
    let errMessage = '';
    if (!body.message) {
      errMessage += ' Request body message is required.';
    }
    if (errMessage) {
      res.json({
        success: false,
        msg: errMessage
      });
    } else {
      const myworkerId = req.params.id;
      Myworker.findById(myworkerId).then(function(myworker) {
        if (myworker === null) {
          return Promise.reject('Myworker ' + myworkerId + ' does not exists.');
        } else {
          return myworker;
        }
      }).then(function(myworker) {
        return User.findById(myworker.worker_user_id).then(function(worker) {
          const smslog = new Smslog({
            sender: {admin_id: adminUser._id},
            receiver: {phone_number: worker.phone_number},
            billable: false,
            message: body.message
          });
          return {
            myworker: myworker,
            smslog: smslog
          };
        });
      }).then(function(result) {
        twiliophoneService.findAndSendToAvailTwiliophone(result.smslog, result.myworker);
        res.json({
          success: true,
          msg: 'Message is in queue.'
        });
      }).catch(httpUtil.handleError(res));
    }
  }
});

module.exports = router;