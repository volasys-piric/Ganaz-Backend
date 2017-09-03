const Promise = require('bluebird');
const db = require('./../../db');
const twilioService = require('./twilio.service');
const pushNotification = require('./../../../push_notification');
const logger = require('./../../../utils/logger');

const Message = db.models.message;
const Job = db.models.job;
const User = db.models.user;
const Company = db.models.company;
const Myworker = db.models.myworker;
const Invite = db.models.invite;

const find = function (body) {
  const $or = [];
  if (body) {
    if (body.company_id) {
      $or.push({'sender.company_id': body.company_id});
      $or.push({'receiver.company_id': body.company_id});
    }
    if (body.user_id) {
      $or.push({'sender.user_id': body.user_id});
      $or.push({'receiver.user_id': body.user_id});
    }
  }
  const dbQ = {};
  if ($or.length > 0) {
    dbQ.$or = $or;
  }
  return Message.find(dbQ);
};

const findById = function (id) {
  return Message.findById(id);
};

function _validate(body) {
  const findPromises = [
    body.job_id ? Job.findById(body.job_id) : Promise.resolve(null),
    User.findById(body.sender.user_id),
    body.sender.company_id ? Company.findById(body.sender.company_id) : Promise.resolve(null)
  ];
  if (body.receivers) {
    const receivers = body.receivers;
    for (let i = 0; i < receivers.length; i++) {
      findPromises.push(User.findById(receivers[i].user_id));
    }
  }
  if (body.receivers_phone_numbers) {
    // https://bitbucket.org/volasys-ss/ganaz-backend/wiki/7.3%20Message%20-%20Create#markdown-header-change-log-v14
    const receivers_phone_numbers = body.receivers_phone_numbers;
    for (let i = 0; i < receivers_phone_numbers.length; i++) {
      const localNumber = receivers_phone_numbers[i];
      findPromises.push(User.findOne({'phone_number.local_number': localNumber}));
    }
  }
  return Promise.all(findPromises).then(function (findResults) {
    const job = findResults[0];
    const senderUser = findResults[1];
    const senderCmpy = findResults[2];
    let errorMessage = "";
    if (body.job_id) {
      if (job === null) {
        errorMessage += ' No job record for job_id ' + body.job_id + '.';
      }
    } else if (body.type === 'recruit') {
      errorMessage += ' job_id is required for message type recruit.';
    }
    if (senderUser === null) {
      errorMessage += " Sender with id " + body.sender.user_id + " does not exists.";
    }
    if (body.sender.company_id && senderCmpy === null) {
      errorMessage += " Sender company " + body.sender.company_id + " does not exists.";
    }
    let hasOnboardingWorker = false;
    const userIdMap = new Map(); // Avoid duplicate creation of Message per user
    const noUserPhoneNumbers = [];

    let counter = 3;
    if (body.receivers) {
      const receivers = body.receivers;
      for (let i = 0; i < receivers.length; i++) {
        const user = findResults[counter];
        if (user === null) {
          errorMessage += " Receiver id " + body.receivers[i].user_id + " does not exists.";
        } else {
          userIdMap.set(user._id.toString(), user);
          if (user.type === 'onboarding-worker') {
            hasOnboardingWorker = true;
          }
        }
        counter++;
      }
    }
    if (body.receivers_phone_numbers) {
      // https://bitbucket.org/volasys-ss/ganaz-backend/wiki/7.3%20Message%20-%20Create#markdown-header-change-log-v14
      const receivers_phone_numbers = body.receivers_phone_numbers;
      for (let i = 0; i < receivers_phone_numbers.length; i++) {
        const user = findResults[counter];
        if (user === null) {
          noUserPhoneNumbers.push(receivers_phone_numbers[i]);
        } else {
          userIdMap.set(user._id.toString(), user);
          if (user.type === 'onboarding-worker') {
            hasOnboardingWorker = true;
          }
        }
        counter++;
      }
    }

    if (hasOnboardingWorker && !body.sender.company_id) {
      errorMessage += " Sender company id is required if one of the receiver is of type onboarding-worker.";
    }

    if (errorMessage.length > 0) {
      return Promise.reject(errorMessage);
    } else {
      return {
        job: job,
        userIdMap: userIdMap,
        noUserPhoneNumbers: noUserPhoneNumbers,
        senderCmpy: senderCmpy
      }
    }
  });
}

function _createMessagesForNonOnboardingWorkers(userIdMap, body) {
  /*
   Already registered users
   - Message object will be created.
   - push notification will be sent.  (will be done later since this is async)
   */
  const messages = [];
  for (const [userId, user] of userIdMap) {
    if (user.type !== 'onboarding-worker') {
      const message = new Message(body);
      message.receiver = {user_id: userId};
      messages.push(message)
    }
  }
  return Promise.resolve(messages);
}

function _createMyworkerInviteMessageForOnboardingWorkers(userIdMap, body) {
  /*
   Onboarding users (If the receiver is onboarding user, this means the sender is company user.)
   - 1) Add the onboarding user to my-workers list of company if not added yet.
   - 2) Invite object will be created if not yet.
   - 3) Message object will be created.
   - SMS will be sent to the onboarding-user. (will be done later since this is async)
   */
  const companyId = body.sender.company_id;
  const promises = [];
  for (const [userId, user] of userIdMap) {
    if (user.type === 'onboarding-worker') {
      promises.push(Promise.resolve(user)); // Pass user object since we will be needing it later
      promises.push(Myworker.findOne({company_id: companyId, worker_user_id: userId}));
      if (user.phone_number && user.phone_number.local_number) {
        promises.push(Invite.findOne({
          company_id: companyId,
          'phone_number.local_number': user.phone_number.local_number
        }));
      } else {
        promises.push(Promise.resolve(null));
      }
    }
  }
  return Promise.all(promises).then(function (promisesResults) {
    const modelsArr = [];
    for (let i = 0; i < promisesResults.length; i += 3) {
      const user = promisesResults[i];
      const userId = user._id.toString();
      let myworker = promisesResults[i + 1];
      let invite = promisesResults[i + 2];
      const models = {myworker: null, invite: null, message: null};
      if (myworker === null) {
        // 1) Add the onboarding user to my-workers list of company if not added yet.
        models.myworker = new Myworker({company_id: companyId, worker_user_id: userId});
      } else {
        logger.info('[Message Service][Onboarding users] Not creating myworker record. User ' + userId + ' company ' + companyId + ' myworker record already exists.')
      }
      if (invite === null) {
        // 2) Invite object will be created if not yet.
        if (user.phone_number && user.phone_number.local_number) {
          models.invite = new Invite({company_id: companyId, phone_number: user.phone_number});
        } else {
          logger.warn('[Message Service][Onboarding users] Not creating invite record. User ' + userId + ' has no phone_number.')
        }
      } else {
        logger.info('[Message Service][Onboarding users] Not creating invite record. Invite with user ' + userId
          + ' and phone number ' + invite.phone_number.local_number + ' already exists.')
      }
      // 3) Message object will be created.
      const message = new Message(body);
      message.receiver = {user_id: userId};
      models.message = message;

      modelsArr.push(models);
    }
    return modelsArr;
  });
}

function _createUserInviteMyworkerMessageForNotRegisteredUsers(noUserPhoneNumbers, body) {
  /*
   Not-registered users
   - 1) New onboarding-user object will be created (Please refer to 1. User - Overview, Data Model)
   - 2) Invite object will be created.
   - 3) Add the onboarding user to my-workers list of company.
   - 4) Message object will be created.
   - SMS will be sent to the onboarding-user. (will be done later since this is async)
   */
  const modelsArr = [];
  const companyId = body.sender.company_id;
  for (let i = 0; i < noUserPhoneNumbers.length; i++) {
    const models = {user: null, invite: null, myworker: null, message: null};
    // 1) New onboarding-user object will be created (Please refer to 1. User - Overview, Data Model)
    const company = {company_id: companyId};
    const localNumber = noUserPhoneNumbers[i];
    const phoneNumber = {country: 'US', country_code: '1', local_number: localNumber};
    models.user = new User({
      type: 'onboarding-worker',
      username: localNumber, // Since username is required and must be unique, so let's set this to localNumber
      company: company,
      phone_number: phoneNumber
    });
    const userId = models.user._id.toString(); // Should not be null
    // 2) Invite object will be created.
    models.invite = new Invite({company_id: companyId, phone_number: phoneNumber});
    // 3) Add the onboarding user to my-workers list of company.
    models.myworker = new Myworker({company_id: companyId, worker_user_id: userId});
    // 4) Message object will be created.
    const message = new Message(body);
    message.receiver = {user_id: userId};
    models.message = message;

    modelsArr.push(models);
  }
  return Promise.resolve(modelsArr);
}

const create = function (body, smsMessageComplete) {
  return _validate(body).then(function (result) {
    const job = result.job;
    const userIdMap = result.userIdMap;
    const noUserPhoneNumbers = result.noUserPhoneNumbers;
    const senderCmpy = result.senderCmpy;
    return _createMessagesForNonOnboardingWorkers(userIdMap, body).then(function (nonOnboardingWorkerMessages) {
      return _createMyworkerInviteMessageForOnboardingWorkers(userIdMap, body).then(function (myworkerInviteMessageForOnboardingWorkerModels) {
        return _createUserInviteMyworkerMessageForNotRegisteredUsers(noUserPhoneNumbers, body).then(function (userInviteMyworkerMessageModels) {
          // 1) Save all users
          // 2) Save all myworkers
          // 3) Save all invites
          // 4) Save all messages
          const saveUserPromises = [];
          const saveMyworkerPromises = [];
          const saveInvitePromises = [];
          const saveMessagePromises = [];
          for (let i = 0; i < userInviteMyworkerMessageModels.length; i++) {
            const models = userInviteMyworkerMessageModels[i];
            saveUserPromises.push(models.user.save());
            saveMyworkerPromises.push(models.myworker.save());
            saveInvitePromises.push(models.invite.save());
            saveMessagePromises.push(models.message.save());
          }
          for (let i = 0; i < myworkerInviteMessageForOnboardingWorkerModels.length; i++) {
            const models = myworkerInviteMessageForOnboardingWorkerModels[i];
            if (models.myworker) {
              saveMyworkerPromises.push(models.myworker.save());
            }
            if (models.invite) {
              saveInvitePromises.push(models.invite.save());
            }
            saveMessagePromises.push(models.message.save());
          }
          for (let i = 0; i < nonOnboardingWorkerMessages.length; i++) {
            const message = nonOnboardingWorkerMessages[i];
            saveMessagePromises.push(message.save());
          }
          return Promise.all(saveUserPromises).then(function () {
            return Promise.all(saveMyworkerPromises);
          }).then(function () {
            return Promise.all(saveInvitePromises)
          }).then(function () {
            return Promise.all(saveMessagePromises);
          }).then(function (savedMessages) {
            /*
             Send push notification and SMSs asynchronously
             */
            // Already registered users  - push notification will be sent.
            for (let i = 0; i < nonOnboardingWorkerMessages.length; i++) {
              const message = nonOnboardingWorkerMessages[i];
              const userId = message.receiver.user_id;
              const user = userIdMap.get(userId);
              if (user.player_ids) {
                pushNotification.sendMessage(user.player_ids, message);
              } else {
                logger.warn('[Message Service] Not sending push notification. User with id ' + userId + ' has no player_ids.');
              }
            }

            let messageBody = null;
            const companyName = senderCmpy.name.en;
            if (body.type === 'recruit') {
              if (smsMessageComplete) {
                messageBody = body.message.es; // When called from recruit.service.js
              } else {
                const jobTitle = job.title.es ? job.title.es : job.title.en;
                const payRate = job.pay.rate;
                const payUnit = job.pay.unit;
                messageBody = companyName + ' pensé que te interesaría este trabajo: ' + jobTitle
                  + ' ' + payRate + ' per ' + payUnit + '. par más información baje la aplicación Ganaz. www.GanazApp.com/download';
              }
            } else {
              // Onboarding users - SMS will be sent to the onboarding-user.
              messageBody = companyName + ' ' + body.message.es + ' Baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. www.GanazApp.com/download';
            }

            for (let i = 0; i < myworkerInviteMessageForOnboardingWorkerModels.length; i++) {
              const models = myworkerInviteMessageForOnboardingWorkerModels[i];
              const userId = models.message.receiver.user_id;
              const user = userIdMap.get(userId);
              if (user.phone_number && user.phone_number.local_number) {
                const toFullNumber = "+1" + user.phone_number.local_number;
                twilioService.sendMessage(toFullNumber, messageBody).catch(function (err) {
                  logger.warn(err);
                });
              } else {
                logger.warn('[Message Service] Not sending SMS. User ' + userId + ' has no phone_number.')
              }
            }
            // Not-registered users - SMS will be sent to the onboarding-user.
            for (let i = 0; i < noUserPhoneNumbers.length; i++) {
              const toFullNumber = "+1" + noUserPhoneNumbers[i];
              twilioService.sendMessage(toFullNumber, messageBody).catch(function (err) {
                logger.warn(err);
              })
            }

            return savedMessages;
          });
        });
      });
    })
  })
};

const updateStatus = function (id, status) {
  return Message.findById(id).then(function (message) {
    if (message === null) {
      return Promise.reject('Message with id ' + id + ' does not exists.');
    } else {
      return message;
    }
  }).then(function (message) {
    message.status = status;
    return message.save();
  });
};

const updateStatusByBulk = function (messageIds, status) {
  return Message.find({_id: {$in: messageIds}}).then(function (messages) {
    const saveMessagePromises = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      message.status = status;
      saveMessagePromises.push(message.save());
    }
    return Promise.all(saveMessagePromises);
  });
};

module.exports = {
  find: find,
  findById: findById,
  create: create,
  updateStatus: updateStatus,
  updateStatusByBulk: updateStatusByBulk
};