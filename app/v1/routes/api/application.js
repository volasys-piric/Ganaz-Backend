const Promise = require('bluebird');
const express = require('express');
const router = express.Router();

const db = require('./../../db');
const logger = require('./../../../utils/logger');
const httpUtil = require('./../../../utils/http');
const pushNotification = require('./../../../push_notification');


const Application = db.models.application;
const Message = db.models.message;
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
  Job.findById(jobId).then(function (job) {
    return User.find({
      'company.company_id': job.company_id,
      'type': {$in: ['company-regular', 'company-admin']}
    }).then(function (users) {
      if (users.length > 0) {
        const promises = [];
        const senderId = req.user._id;
        const senderCompanyId = req.user.company ? req.user.company.company_id : "";
        const application = new Application({job_id: jobId, worker_user_id: req.user._id});
        const message = new Message({
          job_id: jobId,
          type: 'application',
          sender: {user_id: senderId, company_id: senderCompanyId},
          receivers: [],
          message: {
            en: 'New job inquiry. ' + job.title.en,
            es: 'Nueva solicitud de empleo. ' + job.title.es
          },
          metadata: {
            application_id: application._id.toString()
          }
        });
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          const userId = user._id.toString();
          message.receivers.push({
            user_id: userId,
            company_id: user.company && user.company.company_id ? user.company.company_id : ""
          });
        }

        application.save(application);
        promises.push(application.save());
        promises.push(message.save());
        return Promise.join(application.save(), message.save()).then(function (promiseResults) {
          const savedMessage = promiseResults[1];
          // Send push notification asynchronously
          for (let i = 0; i < users.length; i++) {
            const user = users[i];
            if (user.player_ids && user.player_ids.length > 0) {
              pushNotification.sendMessage(user.player_ids, savedMessage);
            } else {
              logger.warn('[Application] Not sending push notification. User with id ' + user._id.toString() + ' has no player_ids.');
            }
          }
          res.json({
            success: true,
            application: promiseResults[0]
          });
        });
      } else {
        const message = 'Job ' + jobId + ' company ' + job.company_id + ' has no company admin or company regular users.';
        logger.error('[Application] ' + message);
        res.json({
          success: false,
          msg: message
        });
      }
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;