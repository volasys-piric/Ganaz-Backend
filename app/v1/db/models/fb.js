const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DynamicSchema = require('./../schema/dynamicschema');

const WebhookSchema = new Schema({
  request: {
    object: {type: String, required: true},
    entry: [{
      _id: false,
      id: {type: String, required: true}, // <PAGE_ID>
      time: {type: Number, required: true}, // Timestamp
      messaging: [DynamicSchema]
    }]
  },
  response: {
    success_message: String,
    exception: {type: DynamicSchema},
  },
  datetime: Date
});

WebhookSchema.pre('save', function(next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

const MessageSchema = new Schema({
  message_id: {type: mongoose.Schema.Types.ObjectId, ref: 'Message'},
  request: {
    messaging_type: {type: String, required: true},
    recipient: {id: {type: String, required: true}},
    message: {text: {type: String, required: true}},
  },
  response: {type: DynamicSchema},
  exception: {type: DynamicSchema},
  datetime: Date,
});

MessageSchema.pre('save', function(next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = {
  webhook: mongoose.model('FbWebhook', WebhookSchema),
  message: mongoose.model('FbMessage', MessageSchema)
};