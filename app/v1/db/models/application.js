/**
 {
     "_id": "{id}",
     "job_id": "{job id}",
     "worker_user_id": "{user object id}"
 }
 */
const Promise = require('bluebird');
const Job = require('./job');
const User = require('./user');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ApplicationSchema = new Schema({
  job_id: {type: String, required: true},
  worker_user_id: String
});

const validateJob = function (model) {
  return Job.findById(model.job_id).then(function (job) {
    if (!job) {
      return Promise.reject('Job ' + model.job_id + ' does not exists in job collection.');
    } else {
      return model;
    }
  });
};

const validateWorkerUserId = function (model) {
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
  const model = this;
  validateJob(model).then(function (model) {
    return validateWorkerUserId(model);
  }).then(function () {
    next();
  }).catch(function (err) {
    return err instanceof Error ? next(err) : next(new Error(err));
  });
});

module.exports = mongoose.model('Application', ApplicationSchema);