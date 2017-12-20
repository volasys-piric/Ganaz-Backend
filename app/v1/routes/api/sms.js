const express = require('express');
const router = express.Router();
const Promise = require('bluebird');

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

const _parseE164Number = function (num) {
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

// https://bitbucket.org/volasys-ss/ganaz-backend/issues/25/twilio-webhook-for-inbound-message
router.post('/inbound', function (req, res) {
  const body = req.body;
  const fromPhone = _parseE164Number(body.From);
  const toPhone = _parseE164Number(body.To);
  
  const userQ = {'phone_number.local_number': fromPhone.local_number};
  if (fromPhone.country_code) {
    userQ['phone_number.country_code'] = fromPhone.country_code;
  }
  const tQ = {'phone_number.local_number': toPhone.local_number};
  if (toPhone.country_code) {
    tQ['phone_number.country_code'] = toPhone.country_code;
  }
  return Promise.all([User.findOne(userQ), Twiliophone.findOne(tQ)]).then(function (promisesResult) {
    const worker = promisesResult[0];
    const twiliophone = promisesResult[1];
    const _rejectInboundSms = function (msg) {
      logger.debug('[SMS API] ' + msg);
      const inboundSms = new InboundSms({
        request: {
          body: body,
          rejected: true,
          reject_reason: msg
        }
      });
      return inboundSms.save().then(function () {
        return null;
      });
    };
    const _createWorkerRecords = function (twiliophone) {
      if (twiliophone.company_ids.length === 1) {
        const companyId = twiliophone.company_ids[0];
        // User.find({type: /^company-/, 'company.company_id': myworker.company_id})
        return Promise.join(
          User.findOne({'company.company_id': companyId, type: 'company-admin'}),
          User.findOne({'company.company_id': companyId, type: 'company-regular'}),
          Company.findById(companyId)
        ).then(function (promisesResult) {
          const now = Date.now();
          const companyUser = promisesResult[0] ? promisesResult[0] : promisesResult[1];
          const companyUserId = companyUser._id.toString();
          const company = promisesResult[2];
          /*
          - New onboarding-user object will be created (Please refer to 1. User - Overview, Data Model)
          - Invite object will be created
          - SMS invitation will be sent out along with the download link to the app.
          - This will also create new sms_log object.
          - Add the onboarding user to my-workers list of company
           */
          const worker = new User({
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
          const invite = new Invite({
            company_id: twiliophone.company_ids[0],
            user_id: companyUserId,
            phone_number: twiliophone.phone_number,
            created_at: now
          });
          const messageBody = company.settings && company.settings.invitation_message ? company.settings.invitation_message
            : company.name.en + ' quisiera recomendar que ud baje la aplicaci�n Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download';
          const smsLog = new Smslog({
            sender: {user_id: companyUserId, company_id: companyId},
            receiver: {phone_number: worker.phone_number},
            billable: false,
            datetime: now,
            message: messageBody
          });
          const myworker = new Myworker({
            company_id: companyId,
            worker_user_id: worker._id.toString(),
            twilio_phone_id: twiliophone._id,
            created_at: now
          });
          const message = new Message({
            job_id: "",
            type: "message",
            sender: {user_id: worker._id.toString(), company_id: ""},
            receivers: [{user_id: companyUserId.toString(), company_id: companyId, status: 'new'}],
            message: {en: body.Body, es: body.Body},
            metadata: {is_from_sms: true},
            auto_translate: false,
            datetime: now
          });
          return Promise.join(worker.save(), invite.save(), myworker.save(), smsLog.save(), message.save())
            .then(function (saveResult) {
              const message = saveResult[4];
              pushNotification.sendMessage(companyUser.player_ids, message);
              // Reply with message invitation
              return smsLog.message.en;
            });
        });
      } else {
        let msg = '';
        if (twiliophone.company_ids.length === 0) {
          msg = 'Phone number ' + body.To + ' has no companies listed.';
        } else {
          msg = 'Phone number ' + body.To + ' is being used by multiple companies.';
        }
        return _rejectInboundSms(msg);
      }
    };
    if (twiliophone) {
      if (worker) {
        return Myworker.findOne({worker_user_id: worker._id.toString(), twilio_phone_id: twiliophone._id})
          .then(function (myworker) {
            if (myworker) {
              return User.find({type: /^company-/, 'company.company_id': myworker.company_id})
                .then(function (companyUsers) {
                  const promises = [];
                  for (let i = 0; i < companyUsers.length; i++) {
                    const message = new Message({
                      job_id: "",
                      type: "message",
                      sender: {user_id: worker._id.toString(), company_id: ""},
                      receivers: [
                        {
                          user_id: companyUsers[i]._id.toString(),
                          company_id: myworker.company_id,
                          status: 'new'
                        }
                      ],
                      message: {en: body.Body, es: body.Body},
                      metadata: {is_from_sms: true},
                      auto_translate: false
                    });
                    promises.push(message.save());
                  }
                  return Promise.all(promises).then(function (savedMessages) {
                    for (let i = 0; i < companyUsers.length; i++) {
                      pushNotification.sendMessage(companyUsers[i].player_ids, savedMessages[i]);
                    }
                    return savedMessages;
                  });
                }).then(function () {
                  return Company.findById(myworker.company_id).then(function (company) {
                    return 'Company ' + company.name.en + ' admins notified.';
                  });
                });
            } else {
              _createWorkerRecords(twiliophone);
            }
          });
      } else {
        _createWorkerRecords(twiliophone);
      }
    } else {
      return _rejectInboundSms('To phone number ' + body.To + ' is not twilio registered number in our system.');
    }
  }).then(function (resultMsg) {
    let messageEl = '';
    if (resultMsg) {
      messageEl += '<Message>' + resultMsg + '</Message>';
    }
    res.send('<Response>' + messageEl + '</Response>');
  });
})
;

module.exports = router;