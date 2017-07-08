var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');
var Promise = require('bluebird');
var Company = require('./company');
var logger = require('./../../../utils/logger');

var PhoneNumberSchema = new Schema({
  country: String,
  country_code: String,
  local_number: String
});

var CompanySchema = new Schema({
  company_id: String
});

var LocationSchema = new Schema({
  address: String,
  loc: {
    type: [Number],  // [<longitude>, <latitude>]
    index: '2d'      // create the geospatial index
  }
});

var WorkerSchema = new Schema({
  location: {type: LocationSchema},
  is_newjob_lock: {type: Boolean, default: false},
});

var UserSchema = new Schema({
  username: {type: String, required: true, unique: true},
  password: String,
  firstname: String,
  lastname: String,
  email_address: String,
  type: {type: String, required: true},
  phone_number: {type: PhoneNumberSchema},
  company: {type: CompanySchema},
  worker: {type: WorkerSchema},
  auth_type: String,
  external_id: String,
  player_ids: [String],
  last_login: Date,
  created_at: Date
});


var validateCompanyId = function (user) {
  if (user.type && user.type.startsWith("company") && user.company && user.company.company_id) {
    Company.findById(user.company.company_id).then(function (company) {
      if (!company) {
        return Promise.reject('Company ' + user.company.company_id + ' does not exists in company collection.');
      } else {
        return user;
      }
    });
  } else {
    return Promise.resolve(user);
  }
};

UserSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

UserSchema.pre('findOneAndUpdate', function (next) {
  validateCompanyId(this).then(function () {
    next();
  }).catch(function (error) {
    if (error instanceof Error) {
      logger.error(error);
      next(error);
    } else {
      logger.warn(error);
      next(new Error(error));
    }
  });
});

UserSchema.methods.comparePassword = function (passw, cb) {
  bcrypt.compare(passw, this.password, function (err, isMatch) {
    if (err) {
      return cb(err);
    }
    cb(null, isMatch);
  });
};

UserSchema.statics.adaptLocation = function (data) {
  if (data.worker && data.worker.location) {
    data.worker.location.loc = [data.worker.location.lng, data.worker.location.lat];
  }
  return data;
}

module.exports = mongoose.model('User', UserSchema);