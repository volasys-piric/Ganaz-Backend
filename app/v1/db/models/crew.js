const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CrewSchema = new Schema({
  company_id: String,
  title: String
});

module.exports = mongoose.model('Crew', CrewSchema);