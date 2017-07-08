var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var MessageSchema = new Schema({
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
  auto_translate: Boolean,
  datetime: Date
});

module.exports = mongoose.model('Message', MessageSchema);