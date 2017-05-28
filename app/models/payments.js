var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CardSchema = new Schema({
    id: String,
    object: String,
    address_city: String,
    address_country: String,
    address_line1: String,
    address_line1_check: String,
    address_line2: String,
    address_state: String,
    address_zip: String,
    address_zip_check: String,
    brand: String,
    country: String,
    customer: String,
    cvc_check: String,
    dynamic_last4: String,
    exp_month: Number,
    exp_year: Number,
    fingerprint: String,
    funding: String,
    last4: String,
    metadata: Schema.Types.Mixed,
    name: String,
    tokenization_method: String
});

var PaymentMethodSchema = new Schema({
	type: {
        type: String
    },
    gateway: String,
    stripe_card: CardSchema,
    billing_address: {
        name: String,
        address1: String,
        address2: String,
        city: String,
        state: String,
        zipcode: String,
        country: String
    },
    company_id: String
});

var PaymentHistorySchema = new Schema({
    success: Boolean,
    datetime: Date,
    payment_method: PaymentMethodSchema,
    charge: {
        id: String,
        object: String,
        amount: Number,
        amount_refunded: Number,
        application: String, 
        application_fee: String,
        balance_transaction: String,
        captured: Boolean,
        created: Number,
        currency: String,
        customer: String,
        description: String,
        destination: String,
        dispute: String, 
        failure_code: String,
        failure_message: String,
        fraud_details: Schema.Types.Mixed,
        invoice: String,
        livemode: Boolean,
        metadata: Schema.Types.Mixed,
        on_behalf_of: String,
        order: String,
        outcome: {
            network_status: String,
            reason: String,
            risk_level: String,
            seller_message: String,
            type: String
        },
        paid: Boolean,
        receipt_email: String,
        receipt_number: String,
        refunded: Boolean,
        refunds: {
            object: String,
            data: [Schema.Types.Mixed],
            has_more: Boolean,
            total_count: Number,
            url: String
        },
        review: String,
        shipping: String,
        source: CardSchema,
        source_transfer: String,
        statement_descriptor: String,
        status: String,
        transfer_group: String
    }
});

module.exports = {
    PaymentHistory: mongoose.model('PaymentHistory', PaymentHistorySchema),
    PaymentMethod: mongoose.model('PaymentMethod', PaymentMethodSchema)
};