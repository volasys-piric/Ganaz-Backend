var Promise = require('bluebird');
var db = require('./../../db');

var Company = db.models.company;
var Review = db.models.review;
var Job = db.models.job;
var Recruit = db.models.recruit;
var Message = db.models.message;

function calculateReviewStats(companyId) {
  return Review.find({company_id: companyId}).then(function (reviews) {
    var totalScore = 0;
    for (var i = 0; i < reviews.length; i++) {
      var rating = reviews[i].rating;
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
    var result = {
      total_jobs: 0,
      total_recruits: 0,
      total_messages_sent: 0
    };
    if (jobs.length > 0) {
      var jobIds = [];
      for (var i = 0; i < jobs.length; i++) {
        jobIds.push(jobs[i]._id.toString());
      }
      return Promise.all([
        Recruit.find({'request.job_id': {$in: jobIds}}),
        Message.find({job_id: {$in: jobIds}})
      ]).then(function (resultArr) {
        var recruits = resultArr[0];
        var messages = resultArr[1];
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
  var companyId = company._id.toString();
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