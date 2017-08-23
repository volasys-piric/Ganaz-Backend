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
  worker_user_id: String,
  created_at: Date
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

const validateWorkerUserId = function (application) {
  if (application.worker_user_id) {
    return User.findById(application.worker_user_id).then(function (user) {
      if (!user) {
        return Promise.reject('User ' + application.worker_user_id + ' does not exists in user collection.');
      } else if (user.type !== 'worker') {
        return Promise.reject('User ' + application.worker_user_id + ' is not a worker.');
      } else {
        return application;
      }
    });
  } else {
    return Promise.resolve(application);
  }
};

ApplicationSchema.pre('save', function (next) {
  const application = this;
  validateJob(application).then(function (application) {
    return validateWorkerUserId(application);
  }).then(function (application) {
    if (!application.created_at) {
      application.created_at = Date.now();
    }
    next();
  }).catch(function (err) {
    return err instanceof Error ? next(err) : next(new Error(err));
  });
});

module.exports = mongoose.model('Application', ApplicationSchema);