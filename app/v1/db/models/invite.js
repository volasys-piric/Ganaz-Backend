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
  }
});

module.exports = mongoose.model('Invite', InviteSchema);