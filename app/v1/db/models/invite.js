const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PhoneNumberSchema = new Schema({
  country: String,
  country_code: String,
  local_number: String
});

const InviteSchema = new Schema({
  company_id: String,
  phone_number: {
    type: PhoneNumberSchema,
    required: true
  },
  created_at: Date
});

InviteSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

module.exports = mongoose.model('Invite', InviteSchema);