var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var RequestSchema = new Schema({
    job_id: String,
    broadcast_radius: {
        type: Number
    },
    re_recruit_worker_user_ids: [String]
});

var RecruitSchema = new Schema({
    company_id: String,
    company_user_id: String,
	request: {
		type: RequestSchema,
		required: true
	},
    recruited_worker_user_ids: [String]
});

module.exports = mongoose.model('Recruit', RecruitSchema);