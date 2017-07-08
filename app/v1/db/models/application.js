/**
 {
     "_id": "{id}",
     "job_id": "{job id}",
     "worker_user_id": "{user object id}"
 }
 */
var Promise = require('bluebird');
var Job = require('./job');
var User = require('./user');
var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var ApplicationSchema = new Schema({
  job_id: {type: String, required: true},
  worker_user_id: String
});

var validateJob = function (model) {
  return Job.findById(model.job_id).then(function (job) {
    if (!job) {
      return Promise.reject('Job ' + model.job_id + ' does not exists in job collection.');
    } else {
      return model;
    }
  });
};

var validateWorkerUserId = function (model) {
  if (model.worker_user_id) {
    User.findById(model.worker_user_id).then(function (user) {
      if (!job) {
        return Promise.reject('User ' + model.worker_user_id + ' does not exists in user collection.');
      } else {
        return model;
      }
    });
  } else {
    return Promise.resolve(model);
  }
};

ApplicationSchema.pre('save', function (next) {
  var model = this;
  validateJob(model).then(function (model) {
    return validateWorkerUserId(model);
  }).then(function () {
    next();
  }).catch(function (err) {
    return err instanceof Error ? next(err) : next(new Error(err));
  });
});

module.exports = mongoose.model('Application', ApplicationSchema);