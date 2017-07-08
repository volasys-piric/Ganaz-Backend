const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RequestSchema = new Schema({
  job_id: String,
  broadcast_radius: Number,
  re_recruit_worker_user_ids: [String]
});

const RecruitSchema = new Schema({
  company_id: String,
  company_user_id: String,
  request: {type: RequestSchema, required: true},
  recruited_worker_user_ids: [String]
});

module.exports = mongoose.model('Recruit', RecruitSchema);