const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TwilioResponseSchema = new Schema({}, {strict: false});
const SmslogSchema = new Schema({
  sender: {
    user_id: {$type: mongoose.Schema.Types.ObjectId, ref: 'User'},
    company_id: {$type: mongoose.Schema.Types.ObjectId, ref: 'Company'}
  },
  receiver: {
    phone_number: {
      country: {$type: String, required: true, default: 'US'},
      country_code: {$type: Number, required: true, minlength: 1, default: 1},
      local_number: {$type: String, length: 10}
    }
  },
  twilio: {
    response: {$type: TwilioResponseSchema},
    exception: {$type: TwilioResponseSchema}
  },
  cost: {$type: Number, required: true, default: 0.5}, // Default: 0.05
  billable: {$type: Boolean, required: true, default: true}, // Default: true
  status: {$type: String, required: true, enum: ['new', 'paid'], default: 'new'},
  datetime: {$type: Date}
}, {typeKey: '$type'});

SmslogSchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = mongoose.model('Smslog', SmslogSchema);