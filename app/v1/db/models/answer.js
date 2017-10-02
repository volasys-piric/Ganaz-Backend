const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MetadataSchema = new Schema({}, {strict: false});
const AnswerSchema = new Schema({
  survey_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Survey', required: true},
  answer: {
    index: String, // [optional]
    text: {en: String, es: String} // [optional]
  },
  responder: {
    user_id: {type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true},
    company_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Company'} // "{company object id, empty in case of worker}"
  },
  metadata: {type: MetadataSchema},
  auto_translate: {type: Boolean, required: true, default: false},
  datetime: {type: Date}
});

AnswerSchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = mongoose.model('Answer', AnswerSchema);