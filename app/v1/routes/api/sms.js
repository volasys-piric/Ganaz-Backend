const express = require('express');
const router = express.Router();
const Promise = require('bluebird');

const appConfig = require('./../../../app_config');
const pushNotification = require('./../../../push_notification');
const answerService = require('./../service/answer.service');
const twiliophoneService = require('./../service/twiliophone.service');
const googleService = require('./../service/google.service');
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
const Survey = db.models.survey;

const _parseE164Number = (num) => {
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
  ).then((promisesResult) => {
    const companyUser = promisesResult[0] ? promisesResult[0] : promisesResult[1];
    if (!companyUser) {
      return Promise.reject('[SMS API Inbound] No company-admin or company-regular user for company ' + companyId + '.');
    } else {
      return companyUser;
    }
  })
}

function _createWorkerRecords(twiliophone, body, fromPhone, worker) {
  /* Once we identify the receiver company, we need to check if the sender (worker) is registered in our platform.
  If the worker is not registered yet in our platform, we need to do the following
   */
  const companyId = twiliophone.company_ids[0];
  return Promise.join(_findCompanyUser(companyId), Company.findById(companyId)).then((findResults) => {
    const companyUser = findResults[0];
    if (!companyUser) {
      const msg = `Company ${companyId} has no company user.`;
      logger.info(`[SMS API Inbound] ${msg}`);
      return Promise.reject(msg);
    }
    const company = findResults[1];
    const now = Date.now();
    const companyUserId = companyUser._id.toString();
    /*
    - New onboarding-user object will be created (Please refer to 1. User - Overview, Data Model) if not exists
    - Invite object will be created
    - SMS invitation will be sent out along with the download link to the app.
    - This will also create new sms_log object.
    - Add the onboarding user to my-workers list of company
     */
    const isNewUser = !worker;
    if (isNewUser) {
      logger.info(`[SMS API Inbound] Creating user/worker record for phone +${fromPhone.country_code}${fromPhone.local_number}`);
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
      logger.info(`[SMS API Inbound] Record user/worker ${worker._id.toString()} is associated to phone ${fromPhone.local_number}.`);
    }
    logger.info(`[SMS API Inbound] Creating invite record for phone ${fromPhone.local_number}.`);
    const invite = new Invite({
      company_id: companyId,
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
      .then(() => _analyzeSmsBodyContents(worker, myworker, body.Body, now, isNewUser))
      .then(() => replyMessage)
  });
}

/*
4. From v1.11, we need to allow worker to answer Survey via SMS. Please check ISSUE 38: Worker can answer survey
questions via SMS for detailed logic to identify if worker's SMS reply is for Survey answer.
*/
function _processSurveyAnswer(lastMessage, responderUser, myworker, smsContents, datetime) {
  logger.info('[SMS API Inbound] Checking if sms is a survey answer.');
  const companyId = myworker.company_id;
  const workerUserId = responderUser._id.toString(); // or myworker.worker_user_id
  if (lastMessage === null) {
    // 4.2.1. If no message yet
    logger.info(`[SMS API Inbound] Sms is not a survey. User ${workerUserId} has no message record.`);
    return _createNewMessageForReceivingCompany(responderUser, myworker, smsContents, datetime)
      .then(() => `Company ${companyId} users notified.`);
  }
  logger.info(`[SMS API Inbound] User ${workerUserId} last message type is ${lastMessage.type}.`);
  smsContents = smsContents.trim();
  if (lastMessage.type === 'survey-choice-single') {
    const surveyId = lastMessage.getSurveyId();
    // 4.2.2. If `last_message.type` == `survey-choice-single`, we check the current SMS contents.
    return Survey.findById(surveyId).then((survey) => {
      let isAnswer = false;
      const choiceNumber = parseInt(smsContents);
      if (!isNaN(choiceNumber) && choiceNumber > 0 && choiceNumber <= survey.choices.length) {
        isAnswer = true
      }
      // 4.2.2.1. If SMS contents is just single-digit and it's in the range of answer choice, we assume that this
      // SMS is answer to the multiple choice. We go to Step 4.3
      if (isAnswer) {
        logger.info(`[SMS API Inbound] User ${workerUserId} sms is an answer to survey ${surveyId}.`);
        // 4.3 Since the current SMS is answer to survey-choice-single, we need to create survey-answer
        // object and create relevant message. Please check WIKI 17.2.2: Survey > Answer - New
        return answerService.createAnswer({
          answer: {index: `${choiceNumber - 1}`, text: {en: smsContents, es: smsContents}},
          responder: {user_id: responderUser._id, company_id: ''},
          auto_translate: survey.auto_tranlate
        }, survey, responderUser, datetime).then(() => survey);
      } else {
        logger.info(`[SMS API Inbound] User ${workerUserId} sms is not an answer to survey ${surveyId}.`);
        // 4.2.2.2. If SMS contents is not single-digit or out of range of answer choice, we assume that this is
        // NOT answer, just normal SMS. Go to Step 5.
        return Promise.resolve(survey);
      }
    }).then((survey) => {
        /*
      return _createNewMessageForReceivingCompany(responderUser, myworker, smsContents, datetime, lastMessage, null, surveyId)
        .then(() => `Company ${companyId} users notified.`);
        */
        return `Company ${companyId} users notified.`;
    });
  } else if (lastMessage.type === 'survey-open-text') {
    // 4.2.3. If `last_message.type` == `survey-open-text`, we need to send confirmation SMS to worker again, just
    // to make sure the current SMS reply from worker is the answer.
    // This will be done after Step 5.
    const surveyId = lastMessage.getSurveyId();
    return _createNewMessageForReceivingCompany(responderUser, myworker, smsContents, datetime, lastMessage, null, surveyId)
      .then((savedCompanyMessage) => {
        logger.info(`[SMS API Inbound] Sending sms confirmation to user ${workerUserId}.`);
        // So, after Step 5, we should do Step 6.
        // 6. This is the step to send survey-confirmation-sms for Open-Text survey (redirected from 4.2.3.)
        // we need to auto-generate message object to track this.
        // 'Is your previous message the reply for survey? Please simply answer Yes / No';
        const surveyConfSmsContents = {
            "en": 'Is your previous message the reply for survey? Please simply answer Yes / No',
            "es": 'El mensaje anterior es tu respuesta a la pregunta de la encuesta? Responda solo con "Sí" o "No"'
        };
        const surveyConfSmsSenderUser = savedCompanyMessage.receivers[0];
        const surveyConfSmsQuestionMessage = new Message({
          job_id: 'NONE',
          type: 'survey-confirmation-sms-question',
          sender: surveyConfSmsSenderUser,
          receivers: [{user_id: workerUserId}],
          message: {
            en: surveyConfSmsContents['en'],
            es: surveyConfSmsContents['es']
          },
          metadata: {survey: {survey_id: surveyId}},
          auto_translate: lastMessage.auto_tranlate,
          datetime: datetime
        });
        const smsLog = new Smslog({
          sender: surveyConfSmsSenderUser,
          receiver: {phone_number: responderUser.phone_number},
          message: surveyConfSmsContents['es'],
          datetime: datetime
        });
        return Promise.join(surveyConfSmsQuestionMessage.save(), smsLog.save()).then((saveResults) => {
          /*
          If the previous message is Open-Text, we need to make sure the current SMS reply from worker is the answer
          for Survey. To do so, we are sending new SMS message to worker asking if it's the answer for survey.
          */
          const smsLog = saveResults[1];
          // Send asynchronously
          twiliophoneService.sendSmsLogByWorker(smsLog, myworker);
          return null;
        });
      }).then(() => {
        return `Company ${companyId} users notified and survey confirmation sms for Open-Text survey is
        sent to worker ${workerUserId}.`;
      })
  } else if (lastMessage.type === 'survey-confirmation-sms-question') {
    const surveyId = lastMessage.getSurveyId();
    const get2ndToTheLastMessage = () => {
      return Message.find({
          'sender.user_id': workerUserId,
          'receivers.company_id': companyId,
          'metadata.survey.survey_id': surveyId
        })
        .sort({datetime: -1}).limit(2)
        .then((messages) => {
          if (messages.length > 0) {
            return messages[0];
          } else {
            return Promise.reject(`Cannot determine 2nd to the last message of user ${workerUserId} for company ${companyId} to survey ${surveyId}`);
          }
        });
    };
    // 4.2.4. If `last_message.type` == `survey-confirmation-sms-question`, we check the current
    // SMS message contents (expecting either Yes or No)

    let refinedContents = smsContents.toLowerCase().trim();
    if (refinedContents === 'yes' || refinedContents === 'sí' || refinedContents === 'si') {
      logger.info(`[SMS API Inbound] User ${workerUserId} confirmed his last sms is an answer to survey ${surveyId}.`);
      // 4.2.4.1. If answer is YES (case-insensitive), the 2nd last message is the answer to the
      // survey (survey question is 3rd last message). Go to 4.4
      // 4.4 Since the current SMS is answer to survey-confirmation-question, the 2nd last message is the answer to survey.
      // 4.4.1. We first update the 2nd last message (set type = `survey-answer`, configure meta-data).
      get2ndToTheLastMessage().then((answerMessage) => {
        logger.info(`[SMS API Inbound] Setting 2nd to the last message type to 'survey-answer'.`);
        answerMessage.type = 'survey-answer';
        return answerMessage.save();
      }).then((answerMessage) => {
        return Survey.findById(surveyId).then((survey) => {
          // 4.4.2 We also need to create `survey-answer` object data model.
          // Please check [WIKI 17.2.2: Survey > Answer - New](https://bitbucket.org/volasys-ss/ganaz-backend/wiki/17.2.2%20Survey%20%3E%20Answer%20-%20New)
          logger.info(`[SMS API Inbound] User ${workerUserId} sms saved im message ${answerMessage._id.toString()} is an answer to survey ${survey._id.toString()}.`);
          return answerService.createAnswerOnly({
              answer: {text: {en: answerMessage.message.en, es: answerMessage.message.es}},
              responder: {user_id: responderUser._id, company_id: ''},
              auto_translate: lastMessage.auto_tranlate
          }, survey, responderUser, answerMessage, datetime);
        });
      }).then(() => {
        // 4.4.3 We still need to follow Step 5 to create message object for the current message.
        // But the message type will be `survey-confirmation-sms-answer` instead of `message`.
        return _createNewMessageForReceivingCompany(responderUser, myworker, smsContents, datetime, lastMessage, 'survey-confirmation-sms-answer')
          .then(() => `Company ${companyId} users notified.`);
      });
    } else {
      // 4.2.4.2. If answer is NO (case-insensitive) or other than YES, the 2nd last message is just ordinary message,
      // and we need to generate message object for 2nd last message (following Step 5)

      /*
      get2ndToTheLastMessage().then((answerMessage) => {
        const msg = `User ${workerUserId} rejected the answer confirmation message for survey ${surveyId}.`;
        logger.info(`[SMS API Inbound] ${msg}`);
        const cloneMessage = answerMessage.toObject();
        cloneMessage._id = undefined;
        delete cloneMessage._id;
        cloneMessage.receivers.forEach((receiver) => receiver.status = 'new');
        cloneMessage.datetime = datetime;
        return new Message(cloneMessage).save().then(() => {
          return msg;
        })
      });
      */
    }
  } else {
    logger.info(`[SMS API Inbound] Sms is not a survey answer.`);
    // 4.2.1. if last message is neither `survey-choice-single`, `survey-open-text`, `survey-confirmation-sms-question`, We assume this is ordinary SMS message. Go to Step 5.
    return _createNewMessageForReceivingCompany(responderUser, myworker, smsContents, datetime, lastMessage)
      .then(() => `Company ${companyId} users notified.`);
  }
}

// Step 5. of https://bitbucket.org/volasys-ss/ganaz-backend/issues/25/twilio-webhook-for-inbound-message
// Finally, we create new message object for receiving company.
function _createNewMessageForReceivingCompany(workerUser, myworker, smsContents, datetime, latestMessage, messageType, surveyId) {
  const companyId = myworker.company_id;
  const workerUserId = workerUser._id.toString();
  logger.info(`[SMS API Inbound] Creating message record for company  ${companyId} from user ${workerUserId}.`);
  return User.find({type: /^company-/, 'company.company_id': companyId}).then((companyUsers) => {
    const metadata = {is_from_sms: true};
    if (surveyId) {
      metadata.survey = {survey_id: surveyId};
    }
    const message = new Message({
      job_id: '',
      type: messageType ? messageType : 'message',
      sender: {user_id: workerUserId, company_id: ''},
      receivers: companyUsers.map((user) => {
        return {
          user_id: user._id.toString(),
          company_id: companyId
        }
      }),
      metadata: metadata,
      auto_translate: false,
      datetime: datetime
    });
    /* If the receiving company and this worker exchanged any message before, we need to check the last message
    to see if it was translated in ES or not (auto_translate == true). If it was translated, we need to translate
    the worker's message from ES to EN. (ISSUE 39: Twilio Webhook should translate the worker's incoming
    message to English if needed)
     */
    if (latestMessage && latestMessage.auto_translate) {
      logger.info(`[SMS API Inbound] Translating ${smsContents} to english.`);
      return googleService.translate(smsContents).then((translations) => {
        message.message = {en: translations[0], es: smsContents}; // Get the first translation
        message.auto_translate = true;
        return message.save().then((savedMessage) => {
          logger.info(`[SMS API Inbound] Sending push notifications to company ${companyId} users.`);
          pushNotification.sendMessage(workerUser.player_ids, savedMessage);
          return savedMessage;
        });
      });
    } else {
      message.message = {en: smsContents, es: smsContents}
      return message.save().then((savedMessage) => {
        logger.info(`[SMS API Inbound] Sending push notifications to company ${companyId} users.`);
        pushNotification.sendMessage(workerUser.player_ids, savedMessage);
        return savedMessage;
      });
    }
  });
}

function _analyzeSmsBodyContents(workerUser, myworker, smsContents, datetime, isNewUser) {
  logger.info('[SMS API Inbound] Analyzing sms body contents.');
  const companyId = myworker.company_id;
  if (isNewUser) {
    logger.info('[SMS API Inbound] Sender is a new user. Creating message for receiving company');
    return _createNewMessageForReceivingCompany(workerUser, myworker, smsContents, datetime)
      .then(() => {
        return `Company ${companyId} users notified.`;
      })
  } else {
    const workerUserId = workerUser._id.toString();
    return Message.findOne({'sender.company_id': companyId, 'receivers.user_id': workerUserId})
      .sort({datetime: -1})
      .then((lastMessage) => {
        return _processSurveyAnswer(lastMessage, workerUser, myworker, smsContents, datetime);
      });
  }
}

function _rejectInboundSms(savedInboundSms, msg) {
  logger.info(`[SMS API Inbound] Dismissing sms - ${msg}`);
  savedInboundSms.request.rejected = true;
  savedInboundSms.request.reject_reason = msg;
  return savedInboundSms.save().then(() => null);
}

// https://bitbucket.org/volasys-ss/ganaz-backend/issues/25/twilio-webhook-for-inbound-message
router.post('/inbound', (req, res) => {
  const body = req.body.From ? req.body : req.query;
  if (!body.From || !body.To) {
    logger.error('[SMS API Inbound] Request From and To are required.');
    // Should never happen unless https://www.twilio.com/docs/api/twiml/sms/twilio_request params have changed
    res.send('<Response><Message>Request From and To are required.</Message></Response>');
  } else {
    if (!body.Body || !body.Body.trim()) {
      body.Body = ' '; // One signal doesnt allow sending null or empty body
    } else {
      body.Body = body.Body.trim();
    }
    const inboundSms = new InboundSms({request: {body: body}});
    inboundSms.save().then((savedInboundSms) => {
      const fromPhone = _parseE164Number(body.From);
      const toPhone = _parseE164Number(body.To);
      logger.info('[SMS API Inbound] Processing From ' + fromPhone.local_number + ' and To ' + toPhone.local_number + ' with body "' + body.Body + '".');
      const createPhoneQ = (phone) => {
        const q = {'phone_number.local_number': phone.local_number};
        if (fromPhone.country_code) {
          q['phone_number.country_code'] = phone.country_code;
        }
        return q;
      }
      const userQ = createPhoneQ(fromPhone);
      const tQ = createPhoneQ(toPhone);

      return Promise.all([User.findOne(userQ), Twiliophone.findOne(tQ)]).then((promisesResult) => {
        const workerUser = promisesResult[0];
        const twiliophone = promisesResult[1];
        if (twiliophone) {
          const _processUserSmsContents = (workerUser, myworker) => {
            return _analyzeSmsBodyContents(workerUser, myworker, body.Body, Date.now(), false).then((responseText) => {
              savedInboundSms.response = {success_message: responseText};
              return savedInboundSms.save().then(() => null)
            });
          };
          if (twiliophone.company_ids.length === 1) {
            // Check if the twilio phone number is provisioned for a certain company. If so, the SMS is for this company.
            if (workerUser) {
              const companyId = twiliophone.company_ids[0];
              const workerId = workerUser._id.toString();
              logger.info(`[SMS API Inbound] Phone ${fromPhone.local_number} is associated to user ${workerId}.`);
              return Myworker.findOne({worker_user_id: workerId, company_id: companyId}).then((myworker) => {
                if (myworker) {
                  logger.info(`[SMS API Inbound] User ${workerId} is associated to my_worker ${myworker._id.toString()}.`);
                  return _processUserSmsContents(workerUser, myworker);
                } else {
                  logger.info(`[SMS API Inbound] User ${workerId} is not associated to any my_worker. Creating worker records.`);
                  return _createWorkerRecords(twiliophone, body, fromPhone, workerUser);
                }
              });
            } else {
              logger.info(`[SMmyworkerS API Inbound] Phone ${fromPhone.local_number} is not associated to any user. Creating worker records.`);
              return _createWorkerRecords(twiliophone, body, fromPhone);
            }
          } else if (workerUser) {
            /* If the twilio phone number is not provisioned for a certain company, or if it is default phone number,
             check the sender (worker) phone number to see if this worker is already created in our system and
             registered to the my-worker list of specific company. If so, the SMS is for this company.
             If the worker is my-worker of multiple companies, we need to select the company to which the worker
             is most-recently added as my-worker.
             */
            const workerId = workerUser._id.toString();
            if (twiliophone.is_default) {
              return Myworker.find({worker_user_id: workerId}).sort({created_at: -1}).limit(1).then((myworkers) => {
                if (myworkers.length > 0) {
                  return _processUserSmsContents(workerUser, myworkers[0]);
                } else {
                  const msg = `Cannot determine company id of 'To' phone ${toPhone.local_number}. Rejecting inbound sms.`;
                  return _rejectInboundSms(savedInboundSms, msg);
                }
              });
            } else if (twiliophone.company_ids.length > 1) {
              return Myworker.find({worker_user_id: workerId, company_id: {$in: twiliophone.company_ids}})
                .sort({created_at: -1}).limit(1).then((myworkers) => {
                  if (myworkers.length > 0) {
                    return _processUserSmsContents(workerUser, myworkers[0]);
                  } else {
                    const msg = `Cannot determine company id of 'To' phone ${toPhone.local_number}. Rejecting inbound sms.`;
                    return _rejectInboundSms(savedInboundSms, msg);
                  }
                });
            } else {
              const msg = `Cannot determine company id of 'To' phone ${toPhone.local_number}. Rejecting inbound sms.`;
              return _rejectInboundSms(savedInboundSms, msg);
            }
          } else {
            const msg = 'Phone number ' + body.To + ' is being used by multiple companies and From number '
              + fromPhone.local_number + ' has no worker record.';
            return _rejectInboundSms(savedInboundSms, msg);
          }
        } else {
          const msg = 'Phone ' + toPhone.local_number + ' is not associated to any twilio phones. Rejecting inbound sms.';
          return _rejectInboundSms(savedInboundSms, msg);
        }
      }).then((replyMessage) => {
        if (replyMessage) { // If _createWorkerRecords
          savedInboundSms.response = {success_message: replyMessage};
          return savedInboundSms.save().then(() => {
            return replyMessage;
          });
        } else {
          return null;
        }
      }).catch((e) => {
        logger.error('[SMS API Inbound] Internal server error.');
        logger.error(e);
        if (typeof e === 'string') {
          savedInboundSms.response = {error_message: e};
        } else {
          savedInboundSms.response = {error_message: e.message};
        }
        return savedInboundSms.save().then(() => {
          return 'Failed to process request. Reason: Internal server error. Please contact ' + appConfig.support_mail;
        });
      });
    }).then((replyMessage) => {
      let messageEl = '';
      if (replyMessage) { // If not rejected.
        messageEl += '<Message>' + replyMessage + '</Message>';
      }
      res.send('<Response>' + messageEl + '</Response>');
    }).catch((e) => {
      logger.error('[SMS API Inbound] Failed to save inbound sms');
      logger.error(e);
      res.send('<Response><Message>Internal server error. Please contact ' + appConfig.support_mail + '</Message></Response>');
    });
  }
});

module.exports = router;
