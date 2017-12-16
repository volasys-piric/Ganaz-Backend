const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RequestSchema = new Schema({}, {strict: false});
const InboundSmsSchema = new Schema({
  request: {type: RequestSchema, required: true},
  user_id: {type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  company_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Company'},
  datetime: Date
});

InboundSmsSchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = mongoose.model('InboundSms', InboundSmsSchema);