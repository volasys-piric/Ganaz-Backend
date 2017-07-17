const Promise = require('bluebird');
const express = require('express');
const router = express.Router();
const messageService = require('./../service/message.service');
const db = require('./../../db');
const httpUtil = require('./../../../utils/http');

const Application = db.models.application;
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
        const receivers = [];
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          receivers.push({user_id: user._id, company_id: job.company_id})
        }
        const senderId = req.user._id;
        const senderCompanyId = req.user.company ? req.user.company.company_id : null;
        const messageBody = {
          job_id: jobId,
          type: 'application',
          sender: {
            user_id: senderId,
            company_id: senderCompanyId
          },
          receivers: receivers,
          message: {
            'en': 'New job inquiry',
            'es': 'Nueva solicitud de empleo'
          },
          auto_translate: false,
          datetime: Date.now(),
          metadata: {
            application_id: application._id.toString()
          }
        };
        return messageService.create(messageBody).then(function () {
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