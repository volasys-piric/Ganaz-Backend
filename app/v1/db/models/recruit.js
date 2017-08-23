const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RequestSchema = new Schema({
  job_id: String,
  broadcast_radius: Number,
  re_recruit_worker_user_ids: [String],
  phone_numbers: [String]
});

const RecruitSchema = new Schema({
  company_id: String,
  company_user_id: String,
  request: {type: RequestSchema, required: true},
  recruited_worker_user_ids: [String],
  nonregistered_phone_numbers: [String],
  created_at: Date
});

RecruitSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

module.exports = mongoose.model('Recruit', RecruitSchema);