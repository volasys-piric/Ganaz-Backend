const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const Survey = require('./survey');

const MetadataSchema = new Schema({}, {strict: false});
const AnswerSchema = new Schema({
  survey_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Survey', required: true},
  survey: {
    owner: {
      company_id: String // Need to be explicitly set because it is needed in searching
    }
  },
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
  if (!this.survey && !this.survey.owner && !!this.survey.owner.company_id) {
    const model = this;
    Survey.findById(model.survey_id).then(function (survey) {
      if (survey === null) {
        next(new Error('Survey with id ' + model.survey_id + ' does not exists.'));
      }
      model.survey = {
        owner: {company_id: survey.owner.company_id}
      };
      next();
    })
  } else {
    next();
  }
});

module.exports = mongoose.model('Answer', AnswerSchema);