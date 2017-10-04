const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MetadataSchema = new Schema({}, {strict: false});
const SurveySchema = new Schema({
  type: {$type: String, required: true, enum: ['choice-single', 'open-text']},
  owner: {
    user_id: {$type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    company_id: String
  },
  question: {
    en: {$type: String, required: true},
    es: {$type: String, required: true}
  },
  choices: [{en: {$type: String, required: true}, es: {$type: String, required: true}}],
  receivers: [{
    user_id: {$type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    company_id: String
  }],
  metadata: {$type: MetadataSchema},
  auto_translate: {$type: Boolean, required: true, default: false},
  datetime: {$type: Date}
}, {typeKey: '$type'});

SurveySchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = mongoose.model('Survey', SurveySchema);