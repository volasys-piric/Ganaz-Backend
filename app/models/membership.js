var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var MembershipSchema = new Schema({
    type: String,
	title: String,
    fee: Number,
    jobs: Number,
    recruits: Number,
    recruits: Number,
    messages: Number
});

module.exports = mongoose.model('Membership', MembershipSchema);