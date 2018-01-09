const Promise = require('bluebird');
const twilio = require('twilio');
const AsyncLock = require('async-lock');
const lock = new AsyncLock({Promise: Promise});
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
const db = require('./../../db');


const Twiliophone = db.models.twiliophone;
const Myworker = db.models.myworker;

const twilio_client = twilio(appConfig.TWILIO_ACCOUNT_SID, appConfig.TWILIO_AUTH_TOKEN);

function _updateSmsLogTwilioField(smsLog, response, exception) {
  const id = smsLog._id.toString();
  if (response) {
    logger.info('[TwiliophoneService] Smslog ' + id + ' successfully sent with response status ' + response.status + '.');
    response._context = undefined;
    response._solution = undefined;
    response._version = undefined;
    delete response._context;
    delete response._solution;
    delete response._version;
  } else if (exception) {
    logger.error('[TwiliophoneService] Failed to send smslog ' + id + '. Reason: ' + exception.message);
  }
  smsLog.twilio = {response: response, exception: exception};
  return smsLog.save();
}

function _sendToTwilio(phone, smsLog, myworker) {
  const twiliophoneId = phone._id.toString();
  
  function doSend() {
    const fromFullNumber = `+${phone.phone_number.country_code}${phone.phone_number.local_number}`;
    const phoneNumber = smsLog.receiver.phone_number;
    const countryCode = phoneNumber.country_code ? phoneNumber.country_code : '1';
    const toFullNumber = `+${countryCode}${phoneNumber.local_number}`;
    const messageBody = smsLog.message;
    return twilio_client.messages.create({
      from: fromFullNumber,
      to: toFullNumber,
      body: messageBody
    }).then(function(response) {
      logger.debug('[TwiliophoneService] Sending smslog ' + smsLog._id.toString()
        + ' to twilio phone ' + twiliophoneId + ' successful.');
      const promises = [_updateSmsLogTwilioField(smsLog, response, null)];
      if (myworker && !myworker.twilio_phone_id) {
        myworker.twilio_phone_id = twiliophoneId;
        promises.push(myworker.save());
      } else {
        promises.push(Promise.resolve(null));
      }
      return Promise.all(promises).then(function() {
        return "sent"
      })
    }).catch(function(err) {
      // https://www.twilio.com/docs/api/errors/20429#error-20429
      if (err.code === 20429) {
        logger.debug('[TwiliophoneService] Sending smslog ' + smsLog._id.toString()
          + ' to twilio phone ' + twiliophoneId + ' failed. Reason: Too many requests. Retrying after 1 second.');
        smsLog.retry_count++;
        if (smsLog.retry_count === 60) { // Will stop spamming twilio if given twilio phone could not be used for sending.
          return _updateSmsLogTwilioField(smsLog, null, err).then(function() {
            return "retry exhausted"
          });
        } else {
          setTimeout(function() {
            return _sendToTwilio(phone, smsLog, myworker);
          }, 1000);
          return "retry.";
        }
      } else {
        logger.debug('[TwiliophoneService] Sending smslog ' + smsLog._id.toString()
          + ' to twilio phone ' + twiliophoneId + ' failed. Error code: ' + err.code);
        return _updateSmsLogTwilioField(smsLog, null, err).then(function() {
          return "failed"
        });
      }
    });
  }
  
  if (phone.usage_count === Number.MAX_SAFE_INTEGER) {
    return _resetUsageCount(phone.company_ids).then(function() {
      return doSend();
    });
  } else {
    return doSend();
  }
}

function _findTwilioPhoneAndIncrementUsageCount(companyId) {
  function findDefaultPhone() {
    return Twiliophone.find({
        is_default: true,
        $or: [{company_ids: {$exists: false}}, {company_ids: {$size: 0}},]
      })
      .sort({usage_count: 1})
      .limit(1).then(function(phones) {
        return phones[0];
      });
  }
  
  return lock.acquire('key1', function() {
    function incUsageCount(phone) {
      return Twiliophone.findByIdAndUpdate(phone._id.toString(), {$inc: {usage_count: 1}}, {'new': true});
    }
    
    if (!companyId) {
      return findDefaultPhone().then(incUsageCount)
    } else {
      return Twiliophone.find({is_default: false, company_ids: companyId})
        .sort({usage_count: 1})
        .limit(1).then(function(phones) {
          return phones.length > 0 ? phones[0] : findDefaultPhone();
        }).then(incUsageCount)
    }
  });
}

function _sendSmsLog(smsLog) {
  return _findTwilioPhoneAndIncrementUsageCount().then(function(phone) {
    return _sendToTwilio(phone, smsLog);
  });
}

function _sendSmsLogByWorkerId(smsLog, myworkerId) {
  return Myworker.findById(myworkerId).then(function(myworker) {
    return _sendSmsLogByWorker(smsLog, myworker);
  });
}

function _sendSmsLogByWorker(smsLog, myworker) {
  if (!smsLog.sender.admin_id && myworker.company_id !== smsLog.sender.company_id.toString()) {
    const msg = 'Not sending smslog ' + smsLog._id.toString()
      + '. Myworker ' + myworkerId + ' company is not the same as smslog sender company.';
    logger.error('[TwiliophoneService] ' + msg);
    return Promise.reject(msg);
  } else if (myworker.twilio_phone_id) {
    return Twiliophone.findByIdAndUpdate(myworker.twilio_phone_id, {$inc: {usage_count: 1}}, {'new': true}).then(function(phone) {
      return _sendToTwilio(phone, smsLog, myworker);
    });
  } else {
    return _findTwilioPhoneAndIncrementUsageCount(myworker.company_id).then(function(phone) {
      return _sendToTwilio(phone, smsLog, myworker);
    });
  }
}

function _resetUsageCount(companyIds) {
  const q = companyIds ?
    {company_ids: {$in: companyIds}} :
    {
      is_default: true,
      $or: [{company_ids: {$exists: false}}, {company_ids: {$size: 0}},]
    };
  return Twiliophone.update(q, {usage_count: 0}, {multi: true});
}

module.exports = {
  search: function(sParams) {
    const dbQ = {};
    if (sParams.company_id) {
      dbQ.company_ids = sParams.company_id
    }
    if (sParams.is_default !== undefined) {
      dbQ.is_default = sParams.is_default;
    }
    if (sParams.phone_number) {
      dbQ['phone_number.local_number'] = new RegExp('^' + sParams.phone_number, 'i');
    }
    return Twiliophone.find(dbQ);
  },
  findById: function(id) {
    return Twiliophone.findById(id);
  },
  create: function(body) {
    const twiliophone = new Twiliophone(body);
    return twiliophone.save().then(function() {
      return _resetUsageCount(body.company_ids).then(function() {
        return twiliophone;
      });
    })
  },
  update: function(id, body) {
    return Twiliophone.findById(id).then(function(existingTwiliophone) {
      if (existingTwiliophone === null) {
        return Promise.reject('Twilio phone with id ' + id + ' does not exists.');
      } else {
        const twiliophone = Object.assign(existingTwiliophone, body);
        return twiliophone.save();
      }
    });
  },
  deleteById: function(id) {
    return Twiliophone.findByIdAndRemove(id);
  },
  sendSmsLog: _sendSmsLog,
  sendSmsLogByWorkerId: _sendSmsLogByWorkerId,
  sendSmsLogByWorker: _sendSmsLogByWorker,
};