const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const MyWorkerSchema = new Schema({
  company_id: {type: String, required: true},
  worker_user_id: String,
  crew_id: String
});

module.exports = mongoose.model('MyWorker', MyWorkerSchema);