const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MembershipSchema = new Schema({
  type: String,
  title: String,
  fee: Number,
  jobs: Number,
  recruits: Number,
  messages: Number
});

module.exports = mongoose.model('Membership', MembershipSchema);