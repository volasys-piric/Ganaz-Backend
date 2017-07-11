const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MembershipSchema = new Schema({
  type: String,
  title: String,
  fee: Number,
  jobs: Number,
  recruits: Number,
  messages: Number,
  created_at: Date
});

MembershipSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

module.exports = mongoose.model('Membership', MembershipSchema);