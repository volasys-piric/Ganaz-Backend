const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SuggestSchema = new Schema({
  job_id: {type: String, required: true},
  worker_user_id: {type: String, required: true},
  suggested_worker: {
    phone_number: {
      country: {type: String, required: true},
      country_code: {type: String, required: true},
      local_number: {type: String, required: true}
    }
  }
});

module.exports = mongoose.model('Suggest', SuggestSchema);