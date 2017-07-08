const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaySchema = new Schema({
  rate: String,
  unit: String
});

const DatesSchema = new Schema({
  from: Date,
  to: Date
});

const BenefitsSchema = new Schema({
  training: Boolean,
  health_checks: Boolean,
  housing: Boolean,
  transportation: Boolean,
  bonus: Boolean,
  scholarships: Boolean
});

const LocationSchema = new Schema({
  address: String,
  loc: {
    type: [Number],  // [<longitude>, <latitude>]
    index: '2d'      // create the geospatial index
  }
});

const JobSchema = new Schema({
  company_id: {type: String, required: true},
  company_user_id: String,
  title: {
    en: String,
    es: String
  },
  pay: {type: PaySchema, required: true},
  dates: {type: DatesSchema, required: true},
  field_condition: String,
  positions_available: Number,
  benefits: {type: BenefitsSchema},
  locations: [LocationSchema],
  comments: {
    en: String,
    es: String
  },
  auto_translate: Boolean,
  created_at: Date,
  status: String
});

JobSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  if (!this.status) {
    this.status = 'activated';
  }
  next();
});

JobSchema.methods.setStatus = function (status) {
  if (status !== 'activated' && status !== 'deactivated') {
    throw new Error('Invalid job status [' + status + ']. Accepted statuses are [activated, deactivated]');
  }
  this.status = status;
};

JobSchema.statics.adaptLocation = function (data) {
  if (data.locations) {
    data.locations.forEach(function (location) {
      data.locations[data.locations.indexOf(location)].loc = [location.lng, location.lat];
    });
  }
  return data;
};

module.exports = mongoose.model('Job', JobSchema);