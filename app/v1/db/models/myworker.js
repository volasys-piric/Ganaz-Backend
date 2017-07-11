const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MyWorkerSchema = new Schema({
  company_id: {type: String, required: true},
  worker_user_id: String,
  crew_id: String,
  nickname: String,
  created_at: Date
});

MyWorkerSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

module.exports = mongoose.model('MyWorker', MyWorkerSchema);