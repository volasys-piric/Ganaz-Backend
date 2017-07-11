const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MessageSchema = new Schema({
  job_id: {type: String, required: true},
  type: String,
  sender: {
    user_id: String,
    company_id: String
  },
  receiver: {
    user_id: String,
    company_id: String
  },
  message: {
    en: String,
    es: String
  },
  status: String,
  metadata: {
    suggest_id: String
  },
  auto_translate: Boolean,
  datetime: Date
});

MessageSchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  if (!this.status) {
    this.status = 'new';
  }
  next();
});

module.exports = mongoose.model('Message', MessageSchema);