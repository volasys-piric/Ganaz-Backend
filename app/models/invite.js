var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var PhoneNumberSchema = new Schema({
    country: {
        type: String
    },
    country_code: {
        type: String
    },
    local_number: {
        type: String
    }
});

var InviteSchema = new Schema({
    company_id: String,
	phone_number: {
		type: PhoneNumberSchema,
		required: true
	}
});

module.exports = mongoose.model('Invite', InviteSchema);