const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PhoneNumberSchema = new Schema({
  country: String,
  country_code: {type: String, require: true, minlength: 1, default: 1},
  local_number: {type: String, require: true, minlength: 10}
});

PhoneNumberSchema.methods.toString = function() {
  return `+${this.country_code}${this.local_number}`;
};

PhoneNumberSchema.methods.samePhone = function(phoneNumber) {
  let cc1 = '';
  let ln1 = '';
  let cc2 = '';
  let ln2 = '';
  /*
  if (this.phone_number) {
    cc1 = this.phone_number.country_code;
    ln1 = this.phone_number.local_number;
  }
  */

  cc1 = this.country_code;
  ln1 = this.local_number;

  if (phoneNumber) {
    cc2 = phoneNumber.country_code;
    ln2 = phoneNumber.local_number;
  }
  return cc1 === cc2 && ln1 === ln2;
};

PhoneNumberSchema.statics.toPhoneNumber = function(number) {
  const phoneNumber = {
    country: '',
    country_code: '1',
    local_number: number
  };
  if (number.length > 10) {
    // Mexican, eg, 011526531293095
    phoneNumber.country_code = number.substr(0, number.length - 10);
    phoneNumber.local_number = number.slice(number.length - 10);
  } else {
    phoneNumber.country = 'US';
  }
};

module.exports = PhoneNumberSchema;
