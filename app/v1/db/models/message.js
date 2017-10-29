const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MetadataSchema = new Schema({}, {strict: false});

const MessageSchema = new Schema({
  job_id: String,
  type: {
    $type: String,
    required: true,
    enum: ['message', 'recruit', 'application', 'suggest', 'survey-choice-single', 'survey-open-text', 'survey-answer']
  },
  sender: {
    user_id: String,
    company_id: String
  },
  receiver: { // deprecated in favor of receivers
    user_id: String,
    company_id: String
  },
  receivers: [{
    user_id: String,
    company_id: String,
    status: {$type: String, required: true, enum: ['new', 'read'], default: 'new'}
  }],
  message: {
    en: String,
    es: String
  },
  status: String, // deprecated in favor of receivers[x].status
  metadata: {$type: MetadataSchema},
  auto_translate: Boolean,
  datetime: Date
}, {typeKey: '$type'});

MessageSchema.pre('save', function (next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  if (!this.status) {
    this.status = 'new';
  }
  next();
});

module.exports = mongoose.model('Message', MessageSchema);