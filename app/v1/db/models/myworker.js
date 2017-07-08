var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var MyWorkerSchema = new Schema({
  company_id: {type: String, required: true},
  worker_user_id: String,
  crew_id: String
});

module.exports = mongoose.model('MyWorker', MyWorkerSchema);