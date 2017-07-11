const stripeService = require('./stripe.service');
const logger = require('./../../../utils/logger');
const db = require('./../../db');

const Company = db.models.company;
const PaymentMethod = db.models.paymentMethod;
const PaymentHistory = db.models.paymentHistory;

const addPaymentMethodToCompany = function (companyId, paymentMethodRequestBody) {
  return Company.findById(companyId).then(function (company) {
    return stripeService.createSource(company.payment_stripe_customer_id, paymentMethodRequestBody.stripe_token)
      .then(function (source) {
        logger.info('Company ' + companyId + ' payment method source id ' + source.id);
        paymentMethodRequestBody.company_id = companyId;
        paymentMethodRequestBody.stripe_card = source;
        const paymentMethod = new PaymentMethod(paymentMethodRequestBody);
        return paymentMethod.save();
      })
  });
};

const pay = function (paymentMethodId, amount, currency, emailAddress) {
  return PaymentMethod.findById(paymentMethodId)
    .then(function (paymentMethod) {
      return stripeService.createCharge(amount, currency, paymentMethod.stripe_card.id, 'Charge for ' + emailAddress)
        .then(function (charge) {
          logger.info('Payment method id ' + paymentMethodId + ' charge id ' + charge.id);
          const paymentHistory = new PaymentHistory({
            success: charge.status !== 'failed',
            datetime: Date.now,
            payment_method: paymentMethod,
            charge: charge
          });
          return paymentHistory.save();
        });
    });
};

module.exports = {
  addPaymentMethodToCompany: addPaymentMethodToCompany,
  deleteById: function (id) {
    return PaymentMethod.findByIdAndRemove(id)
  },
  pay: pay
};