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
      return job;
    }
  }).then(function (job) {
    const suggest = new Suggest(body);
    return suggest.save();
  }).then(function (suggest) {
    // TODO: Send Message but cannot do it since there's no way to retrieve player ids
    res.json({
      success: true,
      suggest: suggest
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;