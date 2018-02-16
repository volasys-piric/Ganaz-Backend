const Promise = require('bluebird');
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const bcrypt = require('bcrypt-nodejs');
const fs = require('fs');
const csv = require('csv-parser');
const multer = require('multer');
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
const httpUtil = require('./../../../utils/http');
const validation = require('./../../../utils/validation');
const twiliophoneService = require('./../service/twiliophone.service');
const inviteService = require('./../service/invite.service');

const Admin = db.models.admin;
const Myworker = db.models.myworker;
const User = db.models.user;
const Smslog = db.models.smslog;
const Company = db.models.company;
const Job = db.models.job;

router.post('/login', function(req, res) {
  // find the user
  const username = req.body.username;
  Admin.findOne({username: username}).then(function(model) {
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
  }, function(error) {
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

const storage = multer.diskStorage({
  filename: function(req, file, cb) {
    cb(null, file.fieldname + '-' + Date.now())
  }
});
const upload = multer({storage: storage});
const parsePhoneNumberCsv = (file, companyId) => {
  return new Promise(function(resolve, reject) {
    const invitesJson = [];
    const existingPhoneNumbers = [];
    fs.createReadStream(file.path)
      .pipe(csv())
      .on('data', function(data) {
        for (let key in data) {
          if (data.hasOwnProperty(key)) {
            const lkey = key.trim().toLowerCase();
            data[lkey] = data[key];
            let value = data[lkey].trim();
            if (value.startsWith('"') && value.endsWith('"')) {
              value = value.substring(1, value.length - 1);
            }
            data[lkey] = value;
          }
        }
        if (data.local_number) {
          const country = data.country ? data.country : 'US';
          const countryCode = data.country_code ? data.country_code : '1';
          let localNumber = data.local_number;
          if (validation.isUSPhoneNumber(localNumber)) {
            localNumber = localNumber.replace(new RegExp('[()\\s-]', 'g'), '');
            const fullPhoneNumber = `${countryCode}${localNumber}`;
            if (existingPhoneNumbers.indexOf(fullPhoneNumber) === -1) {
              existingPhoneNumbers.push(fullPhoneNumber);
              const o = {
                company_id: companyId,
                phone_number: {
                  country: country,
                  country_code: countryCode,
                  local_number: localNumber
                }
              };
              if (data.nickname) {
                o.nickname = data.nickname;
              }
              if (data.crew_name) {
                o.crew_name = data.crew_name;
              }
              invitesJson.push(o);
            } else {
              logger.warn(`Not sending invite to ${fullPhoneNumber}. Duplicate entry found.`);
            }
          } else {
            logger.warn('Not sending invite to ' + localNumber + '. Invalid US phone number.');
          }
        }
      })
      .on('end', function() {
        resolve(invitesJson);
      });
  });
};

router.post('/invite/bulk', upload.single('file'), function(req, res, next) {
  const file = req.file;
  const companyId = req.body.company_id;
  if (!companyId || !companyId.trim()) {
    return res.json({
      success: false,
      msg: 'Requesy body company_id is required.'
    });
  }
  return Company.findById(companyId).then((company) => {
    if (!company) {
      return Promise.reject(`Company ${companyId} does not exists.`);
    }
    return parsePhoneNumberCsv(file, companyId).then(function(invitesJson) {
      return inviteService.bulkInvite(invitesJson, company);
    }).then(() => {
      return res.json({
        success: true,
        msg: 'Invites successfully sent.'
      });
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;