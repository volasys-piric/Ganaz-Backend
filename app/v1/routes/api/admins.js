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
const Company = db.models.company;

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

router.post('/myworker/sendSms', function(req, res) {
  const adminUser = req.user;
  if (!adminUser.admin) {
    res.status(403);
  } else {
    const body = req.body;
    let errMessage = '';
    if (!body.ids || body.ids.length < 1 || !body.message) {
      errMessage += ' Request body ids and message are required.';
    }
    if (errMessage) {
      res.json({
        success: false,
        msg: errMessage
      });
    } else {
      const myworkerIds = body.ids;
      const findMyworkerPromises = [];
      const uniqueMyworkerIds = [];
      for (let i = 0; i < myworkerIds.length; i++) {
        const myworkerId = myworkerIds[i];
        // Remove duplicates. Just in case
        if (uniqueMyworkerIds.indexOf(myworkerId) === -1) {
          findMyworkerPromises.push(Myworker.findById(myworkerId));
          uniqueMyworkerIds.push(myworkerId);
        }
      }
      return Promise.all(findMyworkerPromises).then(function(myworkers) {
        let errorMessages = '';
        const findUserPromises = [];
        for (let i = 0; i < uniqueMyworkerIds.length; i++) {
          const myworker = myworkers[i];
          if (myworker === null) {
            errorMessages += ' Myworker ' + uniqueMyworkerIds[i] + ' does not exists.';
          } else {
            findUserPromises.push(User.findById(myworker.worker_user_id));
          }
        }
        if (errorMessages) {
          return Promise.rejected(errorMessages);
        } else {
          return Promise.all(findUserPromises).then(function(users) {
            const saveSmslogPromises = [];
            for (let i = 0; i < users.length; i++) {
              const user = users[i];
              const smslog = new Smslog({
                sender: {admin_id: adminUser._id},
                receiver: {phone_number: user.phone_number},
                billable: false,
                message: body.message
              });
              saveSmslogPromises.push(smslog.save());
            }
            return Promise.all(saveSmslogPromises).then(function(smslogs) {
              return {
                smslogs: smslogs,
                myworkers: myworkers
              }
            });
          })
        }
      }).then(function(models) {
        const myworkers = models.myworkers;
        const smslogs = models.smslogs;
        for (let i = 0; i < myworkers.length; i++) {
          const myworker = myworkers[i];
          const smslog = smslogs[i];
          // Send asynchronously
          twiliophoneService.sendSmsLogByWorker(smslog, myworker);
        }
        return models;
      }).then(function() {
        res.json({
          success: true,
          msg: 'Message(s) is/are in queue.'
        });
      }).catch(httpUtil.handleError(res));
    }
  }
});

router.get('/companies/:id/invitation_message', function(req, res) {
  const companyId = req.params.id;
  Company.findById(companyId).then(function(company) {
    res.json({
      success: true,
      invitation_message: company.settings ? company.settings.invitation_message : null
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;