const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const bcrypt = require('bcrypt-nodejs');
const Promise = require('bluebird');
const Company = require('./company');
const logger = require('./../../../utils/logger');
const validation = require('./../../../utils/validation');
const PhoneNumberSchema = require('../schema/phonenumber');

const CompanySchema = new Schema({
  company_id: String
});

const LocationSchema = new Schema({
  address: String,
  loc: {
    type: [Number],  // [<longitude>, <latitude>]
    index: '2d'      // create the geospatial index
  }
});

const WorkerSchema = new Schema({
  location: {type: LocationSchema},
  is_newjob_lock: {type: Boolean, default: false},
  job_search_lock: {
    lock: {type: Boolean, default: false},
    allowed_company_ids: [{type: mongoose.Schema.Types.ObjectId, ref: 'Company'}]
  }
});

const UserSchema = new Schema({
  username: String,
  password: String,
  firstname: String,
  lastname: String,
  email_address: String,
  type: {type: String, required: true}, // worker/onboarding-worker/company-regular/company-admin
  phone_number: {type: PhoneNumberSchema, required: true},
  company: {type: CompanySchema},
  worker: {type: WorkerSchema},
  auth_type: String,
  external_id: String,
  player_ids: [String],
  last_login: Date,
  created_at: Date
});


const validateCompanyId = function (user) {
  if (user.type && user.type.startsWith("company") && user.company && user.company.company_id) {
    return Company.findById(user.company.company_id).then(function (company) {
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
  validateCompanyId(this)
    .then(function (user) {
      if (user.phone_number && user.phone_number.local_number) {
        if (validation.isUSPhoneNumber(user.phone_number.local_number)) {
          if (!user.phone_number.country) {
            user.phone_number.country = 'US';
          }
          if (!user.phone_number.country_code) {
            user.phone_number.country_code = '1';
          }
          // Convert to plain xxxxxxxxxx
          user.phone_number.local_number = user.phone_number.local_number.replace(new RegExp('[()\\s-]', 'g'), '');
          return user;
        } else {
          return Promise.reject('Phone number ' + user.phone_number.local_number + ' is an invalid US Phone number.');
        }
      } else {
        return user;
      }
    }).then(function (user) {
    if (!user.created_at) {
      user.created_at = Date.now();
    }
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
};

module.exports = mongoose.model('User', UserSchema);