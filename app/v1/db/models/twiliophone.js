const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TwiliophoneSchema = new Schema({
  is_default: {type: Boolean, required: true, default: false},
  phone_number: {
    country: {type: String, required: true, default: 'US'},
    country_code: {type: String, required: true, default: '1'},
    local_number: {type: String, required: true, unique: true},
    _id: false
  },
  usage_count: {type: Number, default: 0},
  company_ids: [{type: mongoose.Schema.Types.ObjectId, ref: 'Company'}],
  datetime: {type: Date}
});

TwiliophoneSchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = mongoose.model('Twiliophone', TwiliophoneSchema);