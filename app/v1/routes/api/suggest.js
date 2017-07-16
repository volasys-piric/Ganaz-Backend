const Promise = require('bluebird');
const express = require('express');
const router = express.Router();
const db = require('./../../db');
const httpUtil = require('./../../../utils/http');
const messageService = require('./../service/message.service');

const Suggest = db.models.suggest;
const Job = db.models.job;

router.post('/', function (req, res) {
  /** Expected req.body
   {
       "job_id": "{job id}",
       "suggested_worker": {
           "phone_number": {
               "country": "US",
               "country_code": "1",
               "local_number": "1234567890"
           }
       }
   }
   */
  const body = req.body;
  Job.findById(body.job_id).then(function (job) {
    if (job === null) {
      return Promise.reject('Job with id ' + body.job_id + ' does not exists.');
    } else {
      if (!body.worker_user_id) {
        body.worker_user_id = req.user._id;
      }
      const suggest = new Suggest(body);
      return suggest.save().then(function (suggest) {
        const senderId = req.user._id;
        const senderCompanyId = req.user.company ? req.user.company.company_id : null;
        const messageBody = {
          job_id: body.job_id,
          type: 'suggest',
          sender: {
            user_id: senderId,
            company_id: senderCompanyId
          },
          receivers: [{
            user_id: job.company_user_id,
            company_id: job.company_id
          }],
          message: {
            'en': 'This worker might be interested in this job.',
            'es': 'Este trabajador podría estar interesado en este trabajo.'
          },
          auto_translate: false,
          datetime: Date.now()
        };
        return messageService.create(messageBody).then(function () {
          return suggest;
        });
      });
    }
  }).then(function (suggest) {
    res.json({
      success: true,
      suggest: suggest
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;