const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CompanySchema = new Schema({
  name: {
    en: String,
    es: String
  },
  description: {
    en: String,
    es: String
  },
  local_number: String,
  auto_translate: Boolean,
  code: String,
  address: {
    address1: String,
    address2: String,
    city: String,
    state: String,
    country: String,
    zipcode: String
  },
  plan: {
    type: String,
    title: String,
    fee: Number,
    jobs: Number,
    recruits: Number,
    messages: Number,
    start_date: Date,
    end_date: Date,
    auto_renewal: Boolean
  },
  payment_stripe_customer_id: String,
  settings: {
    invitation_message: String
  },
  created_at: Date
}, {typeKey: '$type'});

CompanySchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

CompanySchema.methods.getInvitationMessage = function(phoneNumber) {
  let result = this.settings && this.settings.invitation_message ? this.settings.invitation_message
    : `${this.name.en} quisiera recomendar que ud baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. Haga click aqui`;
  result += `--> https://ganaz.app.link?action=wsp&p=${phoneNumber}`;
  return result;
};

module.exports = mongoose.model('Company', CompanySchema);