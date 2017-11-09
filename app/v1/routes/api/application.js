const Promise = require('bluebird');
const mongoose = require('mongoose');
const express = require('express');
const router = express.Router();

const db = require('./../../db');
const httpUtil = require('./../../../utils/http');
const twilioService = require('./../service/twilio.service');
const pushNotification = require('./../../../push_notification');

const Application = db.models.application;
const Message = db.models.message;
const Smslog = db.models.smslog;
const User = db.models.user;
const Job = db.models.job;

router.post('/search', function (req, res) {
  /** Expected req.body
   {
       "worker_user_id": "{user object id of worker}",        [optional]
       "job_ids": [                                           [optional]
           "{job_id}",
           "{job_id}",
           ...
       ]
   }
   */
  const body = req.body;
  const $or = [];
  if (body) {
    if (body.worker_user_id) {
      $or.push({worker_user_id: body.worker_user_id});
    }
    if (body.job_ids && body.job_ids.length > 0) {
      $or.push({job_id: {$in: body.job_ids}});
    }
  }
  const dbQ = {};
  if ($or.length > 0) {
    dbQ.$or = $or;
  }
  Application.find(dbQ).then(function (applications) {
    res.json({
      success: true,
      applications: applications
    });
  }).catch(httpUtil.handleError(res));
});

router.get('/:id', function (req, res) {
  const applicationId = req.params.id;
  Application.findById(applicationId).then(function (application) {
    if (application === null) {
      return Promise.reject('Application with id ' + applicationId + ' does not exists.');
    } else {
      return Promise.all([User.findById(application.worker_user_id), Job.findById(application.job_id)])
        .then(function (modelArr) {
          const o = application.toObject();
          o.worker_account = modelArr[0];
          o.job = modelArr[1];
          return o;
        });
    }
  }).then(function (appJson) {
    res.json({
      success: true,
      application: appJson
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/', function (req, res) {
  /** Expected req.body
   {
       "job_id": "{job id}"
   }
   */
  const jobId = req.body.job_id;
  const application = new Application({job_id: jobId, worker_user_id: req.user._id});
  application.save(application).then(function (application) {
    return Job.findById(jobId).then(function (job) {
      return User.find({
        'company.company_id': job.company_id,
        'type': {$in: ['company-regular', 'company-admin']}
      }).then(function (users) {
        const senderId = req.user._id;
        const senderCompanyId = req.user.company ? req.user.company.company_id : "";
        const promises = [];
        const now = Date.now();
        const messageEn = 'New job inquiry. ' + job.title.en;
        const messageEs = 'Nueva solicitud de empleo. ' + job.title.es;
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          const userId = user._id.toString();
          const message = new Message({
            job_id: jobId,
            type: 'application',
            sender: {user_id: senderId, company_id: senderCompanyId},
            receiver: {
              user_id: userId,
              company_id: user.company && user.company.company_id ? user.company.company_id : ""
            },
            message: {en: messageEn, es: messageEs},
            metadata: {
              application_id: application._id.toString()
            },
            datetime: now
          });
          const smsLog = new Smslog({
            sender: {
              user_id: mongoose.Types.ObjectId(senderId),
              company_id: senderCompanyId ? mongoose.Types.ObjectId(senderCompanyId) : null
            },
            receiver: {phone_number: user.phone_number},
            message: messageEn
          });
          promises.push(message.save());
          promises.push(smsLog.save());
        }
        return Promise.all(promises).then(function (promiseResults) {
          const smsLogs = [];
          for (let i = 0; i < promiseResults.length; i += 2) {
            const savedMessage = promiseResults[i];
            smsLogs.push(promiseResults[i + 1]);
            const user = users[i / 2];
            // Send push notification asynchronously
            if (user.player_ids) {
              pushNotification.sendMessage(user.player_ids, savedMessage);
            } else {
              logger.warn('[Application] Not sending push notification. User with id ' + userId + ' has no player_ids.');
            }
          }
          // Send SMS asynchronously
          twilioService.sendMessages(smsLogs);
          return application;
        });
      });
    });
  }).then(function (application) {
    res.json({
      success: true,
      application: application
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;