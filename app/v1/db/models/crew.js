const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CrewSchema = new Schema({
  company_id: {type: String, required: true},
  title: String,
  created_at: Date
});

CrewSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

module.exports = mongoose.model('Crew', CrewSchema);