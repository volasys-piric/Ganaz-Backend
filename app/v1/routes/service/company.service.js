const Promise = require('bluebird');
const logger = require('./../../../utils/logger');
const stripeService = require('./stripe.service');
const db = require('./../../db');

const Company = db.models.company;
const Review = db.models.review;
const Job = db.models.job;
const Recruit = db.models.recruit;
const Message = db.models.message;

const getCompany = function (companyId, includeStats) {
  return Company.findById(companyId).then(function (company) {
    if (company === null) {
      return Promise.reject('Company ID ' + companyId + ' does not exists.');
    } else if (includeStats) {
      return _includeCompanyStats(company);
    } else {
      return company;
    }
  });
};

const validateRequestBody = function(body, existingCompany) {
  return Company.findOne({'name.en': body.name.en}).then(function(company) {
    if (!company || (existingCompany && existingCompany._id.toString() === company._id.toString() )) {
      return Promise.resolve();
    } else {
      return Promise.reject('Company with name ' + body.name.en + ' already exists.');
    }
  });
};

const create = function (body) {
  return validateRequestBody(body).then(function() {
    return stripeService.createCustomer(body.name.en).then(function (stripeCustomer) {
      logger.info('Customer ' + body.name.en + ' generated stripe customer id: ' + stripeCustomer.id);
      body.payment_stripe_customer_id = stripeCustomer.id;
      const company = new Company(body);
      return company.save();
    }).then(function (company) {
      return _includeCompanyStats(company);
    });
  });
};

const findByCode = function (code) {
  return Company.find({code: code}).then(function (companies) {
    const promises = [];
    for (let i = 0; i < companies.length; i++) {
      promises.push(_includeCompanyStats(companies[i]));
    }
    return Promise.all(promises);
  });
};

const update = function(id, updatedCompanyDetails) {
  return Company.findById(id).then(function(company) {
    if (!company) {
      return Promise.reject('Company with id ' + id + ' does not exists.');
    } else {
      if (updatedCompanyDetails.name && updatedCompanyDetails.name.en) {
        return validateRequestBody(updatedCompanyDetails, company).then(function() {
          const updatedCompany = Object.assign(company, updatedCompanyDetails);
          return updatedCompany.save();
        });
      } else {
        const updatedCompany = Object.assign(company, updatedCompanyDetails);
        return updatedCompany.save();
      }
    }
  }).then(function(company) {
    return _includeCompanyStats(company);
  });
};

const updatePlan = function (id, plan) {
  return Company.findById(id).then(function (company) {
    company.plan = plan;
    return company.save();
  }).then(function (company) {
    return _includeCompanyStats(company);
  });
};

function _calculateReviewStats(companyId) {
  return Review.find({company_id: companyId}).then(function (reviews) {
    let totalScore = 0;
    for (let i = 0; i < reviews.length; i++) {
      const rating = reviews[i].rating;
      totalScore += rating.pay + rating.benefits + rating.supervisors + rating.safety + rating.trust;
    }
    return {
      total_score: totalScore / 5,
      total_review: reviews.length
    }
  });
}

function _calculateActivityStats(companyId) {
  return Job.find({company_id: companyId}, '_id').then(function (jobs) {
    const result = {
      total_jobs: 0,
      total_recruits: 0,
      total_messages_sent: 0
    };
    if (jobs.length > 0) {
      const jobIds = [];
      for (let i = 0; i < jobs.length; i++) {
        jobIds.push(jobs[i]._id.toString());
      }
      return Promise.all([
        Recruit.find({'request.job_id': {$in: jobIds}}),
        Message.find({job_id: {$in: jobIds}})
      ]).then(function (resultArr) {
        const recruits = resultArr[0];
        const messages = resultArr[1];
        result.total_jobs = jobs.length;
        result.total_recruits = recruits.length;
        result.total_messages_sent = messages.length;
        return result;
      });
    } else {
      return result;
    }
  });
}

function _includeCompanyStats(company) {
  const companyId = company._id.toString();
  return Promise.all([_calculateReviewStats(companyId), _calculateActivityStats(companyId)])
    .then(function (statsArr) {
      const o = company.toObject();
      o.review_stats = statsArr[0];
      o.activity_stats = statsArr[1];
      return o;
    })
}

module.exports = {
  getCompany: getCompany,
  create: create,
  findByCode, findByCode,
  update: update,
  updatePlan: updatePlan
};