var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var PhoneNumberSchema = new Schema({
  country: String,
  country_code: String,
  local_number: String
});

var InviteSchema = new Schema({
  company_id: String,
  phone_number: {
    type: PhoneNumberSchema,
    required: true
  }
});

module.exports = mongoose.model('Invite', InviteSchema);