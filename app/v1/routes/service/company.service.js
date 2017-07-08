const Promise = require('bluebird');
const db = require('./../../db');

const Company = db.models.company;
const Review = db.models.review;
const Job = db.models.job;
const Recruit = db.models.recruit;
const Message = db.models.message;

function calculateReviewStats(companyId) {
  return Review.find({company_id: companyId}).then(function (reviews) {
    const totalScore = 0;
    for (const i = 0; i < reviews.length; i++) {
      const rating = reviews[i].rating;
      totalScore += rating.pay + rating.benefits + rating.supervisors + rating.safety + rating.trust;
    }
    return {
      total_score: totalScore / 5,
      total_review: reviews.length
    }
  });
}

function calculateActivityStats(companyId) {
  return Job.find({company_id: companyId}, '_id').then(function (jobs) {
    const result = {
      total_jobs: 0,
      total_recruits: 0,
      total_messages_sent: 0
    };
    if (jobs.length > 0) {
      const jobIds = [];
      for (const i = 0; i < jobs.length; i++) {
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

function attachAdditionalFields(company) {
  const companyId = company._id.toString();
  return Promise.all([calculateReviewStats(companyId), calculateActivityStats(companyId)])
    .then(function (statsArr) {
      company.review_stats = statsArr[0];
      company.activity_stats = statsArr[1];
      return company;
    })
}

module.exports = {
  getCompany: function (companyId, includeAdditionalFields) {
    return Company.findById(companyId).then(function (company) {
      if (company === null) {
        return Promise.reject('Company ID ' + companyId + ' does not exists.');
      } else if (includeAdditionalFields) {
        return attachAdditionalFields(company);
      } else {
        return company;
      }
    });
  }
};