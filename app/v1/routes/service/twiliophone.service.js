const mongoose = require('mongoose');
const twilio = require('twilio');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
const db = require('./../../db');

const Twiliophone = db.models.twiliophone;

module.exports = {
  search: function (sParams) {
    const dbQ = {};
    if (sParams.company_id) {
      dbQ.company_ids = mongoose.Types.ObjectId(sParams.company_id)
    }
    if (sParams.is_default !== undefined) {
      dbQ.is_default = sParams.is_default;
    }
    return Twiliophone.find(dbQ);
  },
  findById: function (id) {
    return Twiliophone.findById(id);
  },
  create: function (body) {
    const twiliophone = new Twiliophone(body);
    return twiliophone.save();
  }
};