const Promise = require('bluebird');
const express = require('express');
const router = express.Router();
const db = require('./../../db');
const httpUtil = require('./../../../utils/http');
const constants = require('./../../../utils/constants');

const Job = db.models.job;
const Company = db.models.company;
const User = db.models.user;

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/6.1%20Job%20-%20Search
router.post('/search', function (req, res) {
  /** Expected req.body
   {
       "company_id": {company object id},                    [optional]
       "location": {                                         [optional]
           "lat": {latitude},
           "lng": {longitude}
       },
       "distance": {miles},                                  [optional]
       "date": "yyyy-MM-dd",                                 [optional]
       "status": "open/all"                                  [optional]
   }
   */
  const body = req.body;
  const dbQ = {status: 'activated'};
  if (body) {
    if (body.company_id) {
      dbQ.company_id = body.company_id;
    }
    if (body.location && body.distance) {
      dbQ["locations.loc"] = {
        '$near': [Number(body.location.lng), Number(body.location.lat)],
        '$maxDistance': body.distance * constants.degreeInMiles // consider earth radius
      };
    }
    if (body.date) {
      const date = new Date(body.date);
      const nextDay = new Date(body.date);
      nextDay.setDate(nextDay.getDate() + 1);
      dbQ["dates.from"] = {$gte: date};
      dbQ["dates.to"] = {$lt: nextDay};
    }
    if (body.status == "open") {
      dbQ["dates.from"] = {$gt: new Date()};
    }
  }
  Job.find(dbQ).then(function (jobs) {
    res.json({
      success: true,
      jobs: jobs
    });
  }).catch(httpUtil.handleError(res));
});

router.get('/:id', function (req, res) {
  Job.findById(req.params.id).then(function (job) {
    res.json({
      success: true,
      job: job
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/', function (req, res) {
  /** Expected req.body
   {
       "company_id": "{company object id}",
       "company_user_id": "{user id of company user who posted this job}",
       "title": {
           "en": "{title of job in English}",
           "es": "{title of job in Spanish}"
       },
       "comments": {
           "en": "{comments in English}",
           "es": "{comments in Spanish}"
       },
       "auto_translate": true/false,
       "pay": {
           "rate": {pay rate},
           "unit": "lb/hr"
       },
       "dates": {
           "from": "yyyy-MM-dd",
           "to": "yyyy-MM-dd"
       },
       "field_condition": "poor/average/good/excellent",
       "benefits": {
           "training": true/false,
           "health_checks": true/false,
           "housing": true/false,
           "transportation": true/false,
           "bonus": true/false,
           "scholarships": true/false
       },
       "locations": [
           {
               "address": "{address}",
               "lat": {latitude},
               "lng": {longitude}
           }
       ],
       "positions_available": {number of positions}
   }
   */
  const body = req.body;
  _validate(body.company_id, _validate.company_user_id, req.user).then(function (user) {
    body.company_id = user.company.company_id;
    body.company_user_id = user._id;
    const job = new Job(body);
    return job.save();
  }).then(function (job) {
    res.json({
      success: true,
      job: job
    });
  }).catch(httpUtil.handleError(res));
});

router.patch('/:id', function (req, res) {
  /** Expected req.body
   {
       "company_id": "{company object id}",
       "company_user_id": "{user id of company user who posted this job}",
       "title": {
           "en": "{title of job in English}",
           "es": "{title of job in Spanish}"
       },
       "comments": {
           "en": "{comments in English}",
           "es": "{comments in Spanish}"
       },
       "auto_translate": true/false,
       "pay": {
           "rate": {pay rate},
           "unit": "lb/hr"
       },
       "dates": {
           "from": "yyyy-MM-dd",
           "to": "yyyy-MM-dd"
       },
       "field_condition": "poor/average/good/excellent",
       "benefits": {
           "training": true/false,
           "health_checks": true/false,
           "housing": true/false,
           "transportation": true/false,
           "bonus": true/false,
           "scholarships": true/false
       },
       "locations": [
           {
               "address": "{address}",
               "lat": {latitude},
               "lng": {longitude}
           }
       ],
       "positions_available": {number of positions}
   }
   */
  const body = req.body;
  const jobId = req.params.id;
  Job.findById(jobId).then(function (job) {
    if (job === null) {
      return Promise.reject('Job with id ' + jobId + ' does not exists.');
    } else {
      return job;
    }
  }).then(function (job) {
    return _validate(body.company_id, _validate.company_user_id, req.user).then(function (user) {
      body.company_id = user.company.company_id;
      body.company_user_id = user._id;
      const updatedJob = Object.assign(job, body);
      return updatedJob.save();
    });
  }).then(function (job) {
    res.json({
      success: true,
      job: job
    });
  }).catch(httpUtil.handleError(res));
});

router.delete('/:id', function (req, res) {
  Job.findByIdAndRemove(req.params.id).then(function (job) {
    res.json({
      success: true,
      job: job
    });
  }).catch(httpUtil.handleError(res));
});

function _validate(company_id, company_user_id, currentUser) {
  let validateCompanyUser = null;
  if (company_id && company_user_id) {
    validateCompanyUser = User.findById(company_user_id).then(function (user) {
      if (!user) {
        return Promise.reject('User ' + company_user_id + ' does not exists.');
      } else if (user.type !== 'company-regular' && user.type !== 'company-admin') {
        return Promise.reject('Company user id ' + company_user_id + ' type is not company-regular or company-admin.')
      } else if (!user.company || user.company.company_id !== company_id) {
        return Promise.reject('User ' + company_user_id + ' is not a member of company ' + company_id + '.');
      } else {
        return user;
      }
    });
  } else if (company_user_id) {
    validateCompanyUser = User.findById(company_user_id).then(function (user) {
      if (!user) {
        return Promise.reject('User ' + company_user_id + ' does not exists.');
      } else if (user.type !== 'company-regular' && user.type !== 'company-admin') {
        return Promise.reject('Company user id ' + company_user_id + ' type is not company-regular or company-admin.')
      } else if (!user.company || !user.company.company_id) {
        return Promise.reject('Company user id ' + company_user_id + ' is not a member of any ocmpany.')
      } else {
        return user;
      }
    });
  } else if (company_id) {
    if (!currentUser.company || !currentUser.company.company_id || currentUser.company.company_id !== company_id) {
      validateCompanyUser = Promise.reject('Current user is not a member of company ' + company_id + '.');
    } else {
      validateCompanyUser = Promise.resolve(currentUser);
    }
  } else {
    if (!currentUser.company || !currentUser.company.company_id) {
      validateCompanyUser = Promise.reject('Current user is not a member of any company.');
    } else {
      validateCompanyUser = Promise.resolve(currentUser);
    }
  }
  return validateCompanyUser;
}


module.exports = router;