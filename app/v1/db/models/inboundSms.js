const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RequestSchema = new Schema({}, {strict: false});
const InboundSmsSchema = new Schema({
  request: {
    body: {type: RequestSchema, required: true},
    rejected: {type: Boolean, default: false},
    reject_reason: String
  },
  response: {
    success_message: String,
    error_message: String,
  },
  from_user_id: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  to_twilio_phone_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Twiliophone'},
  datetime: Date
});

InboundSmsSchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = mongoose.model('InboundSms', InboundSmsSchema);