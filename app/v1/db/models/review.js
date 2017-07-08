const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const RatingSchema = new Schema({
  pay: Number,
  benefits: Number,
  // coordinates: { type: [Number], index: '2dsphere'},
  supervisors: Number,
  safety: Number,
  trust: Number
});

const ReviewSchema = new Schema({
  company_id: String,
  worker_user_id: {type: String, required: true},
  rating: {type: RatingSchema, required: true},
  comments: String,
  datetime: Date
});

module.exports = mongoose.model('Review', ReviewSchema);