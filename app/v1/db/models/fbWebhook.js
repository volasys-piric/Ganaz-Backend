const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const DynamicSchema = require('./../schema/dynamicschema');

const FbWebhookSchema = new Schema({
  request: {
    object: {type: String, required: true},
    entry: [{
      id: {type: String, required: true}, // <PAGE_ID>
      time: {type: Number, required: true}, // Timestamp
      messaging: [{type: DynamicSchema, required: true}]
    }]
  },
  response: {
    success_message: String,
    exception: {type: DynamicSchema},
  },
  datetime: Date
});

FbWebhookSchema.pre('save', function(next) {
  if (!this.datetime) {
    this.datetime = Date.now();
  }
  next();
});

module.exports = mongoose.model('FbWebhook', FbWebhookSchema);