const express = require('express');
const router = express.Router();
const Promise = require('bluebird');

const appConfig = require('./../../../app_config');
const pushNotification = require('./../../../push_notification');
const logger = require('./../../../utils/logger');
const db = require('./../../db');

const InboundSms = db.models.inboundSms;
const User = db.models.user;
const Invite = db.models.invite;
const Smslog = db.models.smslog;
const Company = db.models.company;
const Message = db.models.message;
const Myworker = db.models.myworker;
const Twiliophone = db.models.twiliophone;

const _parseE164Number = function(num) {
  const o = {country_code: null, local_number: num};
  // See https://www.twilio.com/docs/api/twiml/sms/twilio_request#phone-numbers
  if (num.startsWith('+')) {
    num = num.substring(1);
    if (num.length > 10) {
      o.country_code = num.charAt(0);
      o.local_number = num.substr(num.length - 10);
    }
  }
  return o;
};

function _findCompanyUser(companyId) {
  return Promise.join(
    User.findOne({'company.company_id': companyId, type: 'company-admin'}),
    User.findOne({'company.company_id': companyId, type: 'company-regular'})
  ).then(function(promisesResult) {
    const companyUser = promisesResult[0] ? promisesResult[0] : promisesResult[1];
    if (!companyUser) {
      return Promise.reject('[SMS API Inbound] No company-admin or company-regular user for company ' + companyId + '.');
    } else {
      return companyUser;
    }
  })
}

function _createWorkerRecords(savedInboundSms, twiliophone, body, fromPhone, worker) {
  if (twiliophone.company_ids.length === 1) {
    const companyId = twiliophone.company_ids[0];
    return _findCompanyUser(companyId).then(function(companyUser) {
      return Company.findById(companyId).then(function(company) {
        const now = Date.now();
        const companyUserId = companyUser._id.toString();
        /*
        - New onboarding-user object will be created (Please refer to 1. User - Overview, Data Model) if not exists
        - Invite object will be created
        - SMS invitation will be sent out along with the download link to the app.
        - This will also create new sms_log object.
        - Add the onboarding user to my-workers list of company
         */
        if (!worker) {
          logger.info('[SMS API Inbound] Creating user/worker record for phone ' + fromPhone.local_number);
          worker = new User({
            type: 'onboarding-worker',
            username: fromPhone.local_number,
            phone_number: {
              country: !fromPhone.country_code || fromPhone.country_code === '1' ? 'US' : '',
              country_code: fromPhone.country_code ? fromPhone.country_code : '1',
              local_number: fromPhone.local_number
            },
            worker: {
              location: {address: '', loc: [0, 0]},
              is_newjob_lock: true
            },
            created_at: now
          });
        } else {
          logger.info('[SMS API Inbound] Record user/worker ' + worker._id.toString() + ' is associated to phone ' + fromPhone.local_number);
        }
        logger.info('[SMS API Inbound] Creating invite record for phone ' + fromPhone.local_number);
        const invite = new Invite({
          company_id: twiliophone.company_ids[0],
          user_id: companyUserId,
          phone_number: worker.phone_number,
          created_at: now
        });
        const replyMessage = company.getInvitationMessage(worker.phone_number.local_number);
        logger.info('[SMS API Inbound] Creating smslog record for phone ' + fromPhone.local_number);
        const smsLog = new Smslog({
          sender: {user_id: companyUserId, company_id: companyId},
          receiver: {phone_number: worker.phone_number},
          billable: false,
          datetime: now,
          message: replyMessage
        });
        logger.info('[SMS API Inbound] Creating myworker record for phone ' + fromPhone.local_number);
        const myworker = new Myworker({
          company_id: companyId,
          worker_user_id: worker._id.toString(),
          twilio_phone_id: twiliophone._id,
          created_at: now
        });
        return Promise.join(worker.save(), invite.save(), myworker.save(), smsLog.save())
          .then(function() {
            return _pushMessage(worker, companyId, body.Body, now);
          }).then(function() {
            return replyMessage;
          })
      });
    });
  } else {
    let msg = '';
    if (twiliophone.company_ids.length === 0) {
      if (twiliophone.is_default) {
        msg = 'Phone number ' + body.To + ' is a default twilio phone and has no companies listed.';
      } else {
        msg = 'Phone number ' + body.To + ' has no companies listed.';
      }
    } else {
      msg = 'Phone number ' + body.To + ' is being used by multiple companies.';
    }
    return _rejectInboundSms(savedInboundSms, msg);
  }
}

function _pushMessage(senderUser, companyId, messageBody, datetime) {
  return User.find({type: /^company-/, 'company.company_id': companyId})
    .then(function(companyUsers) {
      logger.info('[SMS API Inbound] Creating message record for phone ' + senderUser.phone_number.local_number);
      const message = new Message({
        job_id: "",
        type: "message",
        sender: {user_id: senderUser._id.toString(), company_id: ""},
        receivers: [],
        message: {en: messageBody, es: messageBody},
        metadata: {is_from_sms: true},
        auto_translate: false,
        datetime: datetime
      });
      for (let i = 0; i < companyUsers.length; i++) {
        message.receivers.push({
          user_id: companyUsers[i]._id.toString(),
          company_id: companyId,
          status: 'new'
        });
      }
      return message.save().then(function(savedMessage) {
        logger.info('[SMS API Inbound] Sending push notifications to company ' + companyId + ' users.');
        for (let i = 0; i < companyUsers.length; i++) {
          pushNotification.sendMessage(companyUsers[i].player_ids, savedMessage);
        }
        return savedMessage;
      });
    });
}

function _rejectInboundSms(savedInboundSms, msg) {
  logger.info('[SMS API Inbound] ' + msg);
  savedInboundSms.request.rejected = true;
  savedInboundSms.request.reject_reason = msg;
  return savedInboundSms.save().then(function() {
    return null;
  });
}

// https://bitbucket.org/volasys-ss/ganaz-backend/issues/25/twilio-webhook-for-inbound-message
router.post('/inbound', function(req, res) {
  const body = req.body.From ? req.body : req.query;
  if (!body.From || !body.To) {
    logger.error('[SMS API Inbound] Request From and To are required.');
    // Should never happen unless https://www.twilio.com/docs/api/twiml/sms/twilio_request params have changed
    res.send('<Response><Message>Request From and To are required.</Message></Response>');
  } else {
    if (!body.Body) {
      body.Body = ' '; // One signal doesnt allow sending null or empty body
    }
    const inboundSms = new InboundSms({request: {body: body}});
    inboundSms.save().then(function(savedInboundSms) {
      const fromPhone = _parseE164Number(body.From);
      const toPhone = _parseE164Number(body.To);
      logger.info('[SMS API Inbound] Processing From ' + fromPhone.local_number + ' and To ' + toPhone.local_number + ' with body "' + body.Body + '".');
      const userQ = {'phone_number.local_number': fromPhone.local_number};
      if (fromPhone.country_code) {
        userQ['phone_number.country_code'] = fromPhone.country_code;
      }
      const tQ = {'phone_number.local_number': toPhone.local_number};
      if (toPhone.country_code) {
        tQ['phone_number.country_code'] = toPhone.country_code;
      }
      return Promise.all([User.findOne(userQ), Twiliophone.findOne(tQ)]).then(function(promisesResult) {
        const worker = promisesResult[0];
        const twiliophone = promisesResult[1];
        if (twiliophone) {
          if (worker) {
            const workerId = worker._id.toString();
            logger.info('[SMS API Inbound] Phone ' + fromPhone.local_number + ' is associated to user ' + workerId + '.');
            return Myworker.findOne({worker_user_id: workerId}).then(function(myworker) {
              if (myworker) {
                logger.info('[SMS API Inbound] User ' + workerId + ' is associated to my_worker ' + myworker._id.toString() + '.');
                const companyId = myworker.company_id;
                return _pushMessage(worker, companyId, body.Body, Date.now()).then(function() {
                  savedInboundSms.response = {success_message: `Company ${companyId} users notified.`};
                  return savedInboundSms.save().then(function() {
                    return null;
                  });
                });
              } else {
                logger.info('[SMS API Inbound] User ' + workerId + ' is not associated to any my_worker. Creating worker records.');
                return _createWorkerRecords(savedInboundSms, twiliophone, body, fromPhone, worker);
              }
            });
          } else {
            logger.info('[SMS API Inbound] Phone ' + fromPhone.local_number + ' is not associated to any user. Creating worker records.');
            return _createWorkerRecords(savedInboundSms, twiliophone, body, fromPhone);
          }
        } else {
          const msg = 'Phone ' + toPhone.local_number + ' is not associated to any twilio phones. Rejecting inbound sms.';
          return _rejectInboundSms(savedInboundSms, msg);
        }
      }).then(function(replyMessage) {
        if (replyMessage) { // If _createWorkerRecords
          savedInboundSms.response = {success_message: replyMessage};
          return savedInboundSms.save().then(function() {
            return replyMessage;
          });
        } else {
          return null;
        }
      }).catch(function(e) {
        logger.error('[SMS API Inbound] Internal server error.');
        logger.error(e);
        if (e instanceof 'string') {
          savedInboundSms.response = {error_message: e};
        } else {
          savedInboundSms.response = {error_message: e.message};
        }
        return savedInboundSms.save().then(function() {
          return 'Failed to process request. Reason: Internal server error. Please contact ' + appConfig.support_mail;
        });
      });
    }).then(function(replyMessage) {
      let messageEl = '';
      if (replyMessage) { // If not rejected.
        messageEl += '<Message>' + replyMessage + '</Message>';
      }
      res.send('<Response>' + messageEl + '</Response>');
    }).catch(function(e) {
      logger.error('[SMS API Inbound] Failed to save inbound sms');
      logger.error(e);
      res.send('<Response><Message>Internal server error. Please contact ' + appConfig.support_mail + '</Message></Response>');
    });
  }
})
;

module.exports = router;