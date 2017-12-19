const Promise = require('bluebird');
const mongoose = require('mongoose');
const twilio = require('twilio');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
const db = require('./../../db');

const Twiliophone = db.models.twiliophone;
const Myworker = db.models.myworker;

const twilio_client = twilio(appConfig.TWILIO_ACCOUNT_SID, appConfig.TWILIO_AUTH_TOKEN);

function _updateTwilioField(smsLog, response, exception) {
  const id = smsLog._id.toString();
  if (response) {
    logger.info('[Twilio Service] Smslog ' + id + ' successfully sent with response status ' + response.status + '.');
    response._context = undefined;
    response._solution = undefined;
    response._version = undefined;
    delete response._context;
    delete response._solution;
    delete response._version;
  } else if (exception) {
    logger.error('[Twilio Service] Failed to send smslog ' + id + '. Reason: ' + exception.message);
  }
  smsLog.twilio = {response: response, exception: exception};
  return smsLog.save();
}

/**
 * Send if given twilio phone id is not in use - Twiliophone.usage_count = 0
 * @param twiliophoneId
 * @param smsLog
 * @param myworker
 * @param retry
 * @returns {Promise}
 * @private
 */
function _sendIfTwiliophoneNotInUsed(twiliophoneId, smsLog, myworker, retry) {
  return Twiliophone.findByIdAndUpdate(twiliophoneId, {$inc: {usage_count: 1}}, {'new': true})
    .then(function (twilioPhone) {
      // Send SMS
      if (twilioPhone.usage_count === 1) {
        const phoneNumber = smsLog.receiver.phone_number;
        const countryCode = phoneNumber.country_code ? phoneNumber.country_code : '1';
        const toFullNumber = '+' + countryCode + phoneNumber.local_number;
        const messageBody = smsLog.message;
        logger.debug('[TwiliophoneService] Sending smslog ' + smsLog._id.toString()
          + ' to twilio phone ' + twiliophoneId + '.');
        twilio_client.messages.create({
          from: appConfig.TWILIO_PHONE_NUMBER,
          to: toFullNumber,
          body: messageBody
        }).then(function (response) {
          logger.debug('[TwiliophoneService] Sending smslog ' + smsLog._id.toString()
            + ' to twilio phone ' + twiliophoneId + ' successful.');
          Twiliophone.findByIdAndUpdate(twiliophoneId, {$inc: {usage_count: -1}})
            .then(function () {
              const promises = [_updateTwilioField(smsLog, response, null)];
              if (myworker && !myworker.twilio_phone_id) {
                myworker.twilio_phone_id = mongoose.Schema.Types.ObjectId(twiliophoneId);
                promises.push(myworker.save());
              } else {
                promises.push(Promise.resolve(null));
              }
              Promise.all(promises).catch(function (e) {
                logger.error(e)
              })
            });
        }).catch(function (err) {
          // https://www.twilio.com/docs/api/errors/20429#error-20429
          if (err.code === 20429) {
            logger.debug('[TwiliophoneService] Sending smslog ' + smsLog._id.toString()
              + ' to twilio phone ' + twiliophoneId + ' failed. Reason: Too many requests. Retrying after 1 second.');
            Twiliophone.findByIdAndUpdate(twiliophoneId, {$inc: {usage_count: -1}})
              .then(function () {
                setTimeout(_sendIfTwiliophoneNotInUsed, 1000, twiliophoneId, smsLog, myworker, true);
              });
          } else {
            logger.debug('[TwiliophoneService] Sending smslog ' + smsLog._id.toString()
              + ' to twilio phone ' + twiliophoneId + ' failed. Error code: ' + err.code);
            Twiliophone.findByIdAndUpdate(twiliophoneId, {$inc: {usage_count: -1}})
              .then(function () {
                _updateTwilioField(smsLog, null, err).catch(function (e) {
                  logger.error(e)
                })
              });
          }
        });
        return true;
      } else {
        logger.debug('[TwiliophoneService] Twilio phone ' + twiliophoneId + ' is in use.');
        return Twiliophone.findByIdAndUpdate(twiliophoneId, {$inc: {usage_count: -1}})
          .then(function () {
            if (retry) {
              logger.debug('[TwiliophoneService] Retry sending sms ' + smsLog._id.toString()
                + ' to twilio phone ' + twiliophoneId + ' after 1 second.');
              setTimeout(_sendIfTwiliophoneNotInUsed, 1000, twiliophoneId, smsLog, myworker, true)
            } else {
              return false;
            }
          });
      }
    });
}

function _findAvailTwiliophone(companyId) {
  if (companyId) {
    return Twiliophone.findOne({
      is_default: false,
      usage_count: 0,
      company_ids: mongoose.Schema.Types.ObjectId(companyId)
    }).then(function (phone) {
      return phone ? phone : Twiliophone.findOne({is_default: true, usage_count: 0});
    });
  } else {
    return Twiliophone.findOne({is_default: true, usage_count: 0});
  }
}

function _findAndSendToAvailTwiliophone(smsLog, myworker) {
  const companyId = smsLog.sender.company_id;
  return Twiliophone.find({
    is_default: false,
    company_ids: mongoose.Schema.Types.ObjectId(companyId)
  }).then(function (phones) {
    if (phones && phones.length > 0) {
      let phone = null;
      for (let i = 0; i < phones.length; i++) {
        if (phones[i].usage_count === 0) {
          phone = phones[i];
          break;
        }
      }
      if (phone !== null) {
        // Try to send smslog given avail twiliophone.
        _sendIfTwiliophoneNotInUsed(phone._id.toString(), smsLog, myworker).then(function (sent) {
          if (!sent) {
            // At some instant (usually split of milliseconds), the avail phone was used by other request.
            logger.debug('[TwiliophoneService] Will look for available phone after 1 second.');
            setTimeout(_findAndSendToAvailTwiliophone, 1000, smsLog, myworker); // Try again after 1 second
          }
        });
      } else {
        logger.debug('[TwiliophoneService] All phone numbers for company ' + companyId + ' is in use. Will retry sending smslog '
          + smsLog._id.toString() + ' after 1 second.');
        setTimeout(_sendMessage, 1000, smsLog, myworker); // Try again after 1 second
      }
    } else {
      logger.debug('[TwiliophoneService] No phone configured for company ' + companyId + '.');
    }
  });
}

/**
 * Sends smslog asynchronously
 *
 * @param smsLog
 * @param myworkerId
 * @private
 */
function _sendMessage(smsLog, myworkerId) {
  if (myworkerId) {
    Myworker.findById(myworkerId).then(function (myworker) {
      if (myworker) {
        if (myworker.company_id !== smsLog.sender.company_id.toString()) {
          logger.error('[TwiliophoneService] Not sending smslog ' + smsLog._id.toString()
            + '. Myworker ' + myworkerId + ' company is not the same as smslog sender company.');
        } else if (myworker.twilio_phone_id) {
          _sendIfTwiliophoneNotInUsed(myworker.twilio_phone_id, smsLog, myworker).then(function (sent) {
            if (!sent) {
              logger.debug('[TwiliophoneService] Retry sending sms ' + smsLog._id.toString() + ' to phone '
                + myworker.twilio_phone_id + 'after 1 second.');
              setTimeout(_sendIfTwiliophoneNotInUsed, 1000, myworker.twilio_phone_id, smsLog);
            }
          });
        } else {
          _findAndSendToAvailTwiliophone(smsLog, myworker);
        }
      } else {
        _findAndSendToAvailTwiliophone(smsLog);
      }
    });
  } else {
    _findAndSendToAvailTwiliophone(smsLog);
  }
}

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
  },
  update: function (id, body) {
    return Twiliophone.findById(id).then(function (existingTwiliophone) {
      if (existingTwiliophone === null) {
        return Promise.reject('Twilio phone with id ' + id + ' does not exists.');
      } else {
        const twiliophone = Object.assign(existingTwiliophone, body);
        return twiliophone.save();
      }
    });
  },
  deleteById: function (id) {
    return Twiliophone.findByIdAndRemove(id);
  },
  sendMessage: _sendMessage
};