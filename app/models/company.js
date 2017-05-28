var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CompanySchema = new Schema({
    name: {
        en: String,
        es: String
    },
    description: {
        en: String,
        es: String
    },
    local_number: {
        type: String
    },
    auto_translate: {
        type: Boolean
    },
    code: {
        type: String
    },
    address: {
        address1: String,
        address2: String,
        city: String,
        state: String,
        country: String
    },
    plan: {
        type: {
            type: String
        },
        title: String,
        fee: Number,
        jobs: Number,
        recruits: Number,
        messages: Number,
        start_date: {
            type: Date
        },
        end_date: {
            type: Date
        },
        auto_renewal: Boolean
    },
    payment_stripe_customer_id: String
});

module.exports = mongoose.model('Company', CompanySchema);