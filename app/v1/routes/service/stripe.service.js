const appConfig = require('./../../../app_config');
const stripe = require('stripe')(appConfig.STRIPE_SECRET_KEY);

module.exports = {
  createCustomer: function (customerName) {
    return stripe.customers.create({description: 'Customer for ' + customerName});
  },
  createSource: function (stripeCustomerId, stripeToken) {
    return stripe.customers.createSource(stripeCustomerId, {source: stripeToken});
  },
  createCharge: function (amount, currency, sourceId, description) {
    return stripe.charges.create({
      amount: amount,
      currency: currency,
      source: sourceId,
      description: description
    });
  }
};