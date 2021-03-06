const Promise = require('bluebird');
const mongoose = require('mongoose');
const db = require('./../../db');
const twiliophoneService = require('./twiliophone.service');
const pushNotification = require('./../../../push_notification');
const logger = require('./../../../utils/logger');

const Message = db.models.message;
const Job = db.models.job;
const User = db.models.user;
const Company = db.models.company;
const Myworker = db.models.myworker;
const Invite = db.models.invite;
const Smslog = db.models.smslog;

const PhoneNumberSchema = db.schema.phonenumber;

const find = function (body) {
  const $or = [];
  if (body) {
    if (body.company_id) {
      $or.push({'sender.company_id': body.company_id});
      $or.push({'receiver.company_id': body.company_id});
      $or.push({'receivers.company_id': body.company_id});
    }
    if (body.user_id) {
      $or.push({'sender.user_id': body.user_id});
      $or.push({'receiver.user_id': body.user_id});
      $or.push({'receivers.user_id': body.user_id});
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
    body.job_id && mongoose.Types.ObjectId.isValid(body.job_id) ? Job.findById(body.job_id) : Promise.resolve(null),
    User.findById(body.sender.user_id),
    body.sender.company_id ? Company.findById(body.sender.company_id) : Promise.resolve(null)
  ];
  let findUsersPromise = null;
  if (body.receivers || body.receivers_phone_numbers) {
    const $orQ = [];
    if (body.receivers) {
      $orQ.push({
        _id: {
          $in: body.receivers.map(function (receiver) {
            return mongoose.Types.ObjectId(receiver.user_id);
          })
        }
      })
    }
    if (body.receivers_phone_numbers) {
      $orQ.push({'phone_number.local_number': {$in: body.receivers_phone_numbers}});
    }
    findUsersPromise = User.find({$or: $orQ});
  }
  if (findUsersPromise) {
    findPromises.push(findUsersPromise);
  }
  return Promise.all(findPromises).then(function (findResults) {
    const job = findResults[0];
    const senderUser = findResults[1];
    const senderCmpy = findResults[2];
    let errorMessage = "";
    if (body.job_id && mongoose.Types.ObjectId.isValid(body.job_id)) {
      if (!job) {
        errorMessage += ` No job record for job_id ${body.job_id}.`;
      }
    } else if (body.type === 'recruit') {
      errorMessage += ' Valid job_id is required for message type recruit.';
    }
    if (!senderUser) {
      errorMessage += ` Sender with id ${body.sender.user_id} does not exists.`;
    }
    if (body.sender.company_id) {
      if (!senderCmpy) {
        errorMessage += ` Sender company ${body.sender.company_id} does not exists.`;
      } else if (senderUser !== null && senderUser.company && (senderUser.company.company_id !== body.sender.company_id)) {
        errorMessage += ` Sender ${body.sender.company_id} does not belong to the sender.company_id specified.`;
      }
    } else if (senderUser !== null && senderUser.company && senderUser.company.company_id) {
      body.sender.company_id = senderUser.company.company_id;
    }
    let hasOnboardingWorker = false;
    const noUserPhoneNumbers = [];
    const userIdMap = new Map(); // Avoid duplicate creation of Message per user
    if (findResults.length === 4) {
      const users = findResults[3];
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        userIdMap.set(user._id.toString(), user);
      }
      if (body.receivers) {
        const receivers = body.receivers;
        for (let i = 0; i < receivers.length; i++) {
          const user = userIdMap.get(receivers[i].user_id);
          if (!user) {
            errorMessage += ` Receiver id ${receivers[i].user_id} does not exists.`;
          } else if (user.type === 'onboarding-worker') {
            hasOnboardingWorker = true;
          }
        }
      }
      if (body.receivers_phone_numbers) {
        const findUserByPhoneNumber = function (localNumber) {
          let user = null;
          for (let i = 0; i < users.length; i++) {
            if (users[i].phone_number.local_number === localNumber) {
              user = users[i];
              break;
            }
          }
          return user;
        };
        // https://bitbucket.org/volasys-ss/ganaz-backend/wiki/7.3%20Message%20-%20Create#markdown-header-change-log-v14
        const receivers_phone_numbers = body.receivers_phone_numbers;
        for (let i = 0; i < receivers_phone_numbers.length; i++) {
          const localNumber = receivers_phone_numbers[i];
          const user = findUserByPhoneNumber(localNumber);
          if (!user) {
            if (noUserPhoneNumbers.indexOf(localNumber) === -1) {
              noUserPhoneNumbers.push(localNumber);
              hasOnboardingWorker = true;
            }
          } else if (user.type === 'onboarding-worker') {
            hasOnboardingWorker = true;
          }
        }
      }
    }

    if (hasOnboardingWorker && !body.sender.company_id) {
      errorMessage += " Sender company id is required if one of the receiver is of type onboarding-worker or or if one of the receivers_phone_numbers doesnt exist.";
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

function _createMessage(body, receiverUser) {
  const message = new Message(body);
  const userId = receiverUser._id.toString();
  const companyId = receiverUser.company && receiverUser.company.company_id ? receiverUser.company.company_id : "";
  message.receiver = {user_id: userId, company_id: companyId, status: 'new'};
  return message;
}

function _createMessagesForNonOnboardingWorkers(userIdMap, body) {
  /*
   Already registered users
   - Message object will be created.
   - push notification will be sent.  (will be done later since this is async)
   */
  const messages = [];
  for (const user of userIdMap.values()) {
    if (user.type !== 'onboarding-worker') {
      const message = _createMessage(body, user);
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
  const senderCompanyId = body.sender.company_id;
  const senderUserId = body.sender.user_id;
  const promises = [];
  for (const [userId, user] of userIdMap) {
    if (user.type === 'onboarding-worker') {
      promises.push(Promise.resolve(user)); // Pass user object since we will be needing it later
      promises.push(Myworker.findOne({company_id: senderCompanyId, worker_user_id: userId}));
      if (user.phone_number && user.phone_number.local_number) {
        promises.push(Invite.findOne({
          company_id: senderCompanyId,
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
      const models = {myworker: myworker, invite: null, message: null};
      if (!myworker) {
        // 1) Add the onboarding user to my-workers list of company if not added yet.
        models.myworker = new Myworker({company_id: senderCompanyId, worker_user_id: userId});
      } else {
        logger.info('[Message Service][Onboarding users] Not creating myworker record. User ' + userId + ' company ' + senderCompanyId + ' myworker record already exists.')
      }
      if (!invite) {
        // 2) Invite object will be created if not yet.
        if (user.phone_number && user.phone_number.local_number) {
          models.invite = new Invite({
            user_id: senderUserId,
            company_id: senderCompanyId,
            phone_number: user.phone_number,
            // Since 1.12
            sender: {
              user_id: senderUserId,
              company_id: senderCompanyId,
            },
            receiver: {
              type: 'worker',
              worker: {phone_number: user.phone_number}
            }
          });
        } else {
          logger.warn('[Message Service][Onboarding users] Not creating invite record. User ' + userId + ' has no phone_number.')
        }
      } else {
        logger.info('[Message Service][Onboarding users] Not creating invite record. Invite with user ' + userId
          + ' and phone number ' + invite.phone_number.local_number + ' already exists.')
      }
      // 3) Message object will be created.
      models.message = _createMessage(body, user);

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
  const senderUserId = body.sender.user_id;
  for (let i = 0; i < noUserPhoneNumbers.length; i++) {
    const models = {user: null, invite: null, myworker: null, message: null};
    // 1) New onboarding-user object will be created (Please refer to 1. User - Overview, Data Model)
    const localNumber = noUserPhoneNumbers[i];
    const phoneNumber =  {country: 'US', country_code: '1', local_number: localNumber};
    models.user = new User({
      access_token: '',
      type: 'onboarding-worker',
      firstname: '',
      lastname: '',
      username: localNumber, // Since username is required and must be unique, so let's set this to localNumber
      email_address: '',
      phone_number: phoneNumber,
      auth_type: 'phone',
      external_id: '',
      player_ids: [],
      last_login: '',
      created_at: '',
      worker: {
        location: {address: '', loc: [0, 0]},
        is_newjob_lock: true
      }
    });
    const userId = models.user._id.toString(); // Should not be null
    // 2) Invite object will be created.
    models.invite = new Invite({
      user_id: senderUserId,
      company_id: companyId,
      phone_number: phoneNumber,
      // Since 1.12
      sender: {
        user_id: senderUserId,
        company_id: companyId,
      },
      receiver: {
        type: 'worker',
        worker: {phone_number: phoneNumber}
      }
    });
    // 3) Add the onboarding user to my-workers list of company.
    models.myworker = new Myworker({company_id: companyId, worker_user_id: userId});
    // 4) Message object will be created.
    models.message = _createMessage(body, models.user);

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
          // const saveMessagePromises = [];
          const messageModel = new Message(body);
          messageModel.receivers = []; // Since 1.7
          for (let i = 0; i < userInviteMyworkerMessageModels.length; i++) {
            const models = userInviteMyworkerMessageModels[i];
            saveUserPromises.push(models.user.save());
            saveMyworkerPromises.push(models.myworker.save());
            saveInvitePromises.push(models.invite.save());
            messageModel.receivers.push(models.message.receiver);
          }
          for (let i = 0; i < myworkerInviteMessageForOnboardingWorkerModels.length; i++) {
            const models = myworkerInviteMessageForOnboardingWorkerModels[i];
            if (models.myworker) {
              saveMyworkerPromises.push(models.myworker.save());
            }
            if (models.invite) {
              saveInvitePromises.push(models.invite.save());
            }
            messageModel.receivers.push(models.message.receiver);
          }
          for (let i = 0; i < nonOnboardingWorkerMessages.length; i++) {
            const onboardingWorkerMessage = nonOnboardingWorkerMessages[i];
            messageModel.receivers.push(onboardingWorkerMessage.receiver);
          }
          return Promise.all(saveUserPromises).then(function () {
            return Promise.all(saveMyworkerPromises);
          }).then(function () {
            return Promise.all(saveInvitePromises)
          }).then(function () {
            return messageModel.save();
          }).then(function (savedMessage) {
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
            const senderUserId = body.sender.user_id;
            const senderCompanyId = body.sender.company_id;
            const saveSmsLogPromises = [];
            const saveSmsLog = function(phoneNumber) {
              let messageBody = null;
              if (body.type === 'recruit') {
                if (smsMessageComplete) {
                  messageBody = body.message.es; // When called from recruit.service.js
                } else {
                  const companyName = senderCmpy.name.en; // sender company is required for recruit message
                  const jobTitle = job.title.es ? job.title.es : job.title.en;
                  const payRate = job.pay.rate;
                  const payUnit = job.pay.unit;
                  messageBody = `${companyName} pensé que te interesaría este trabajo: ${jobTitle} ${payRate} per ${payUnit}. par más información baje la aplicación Ganaz. https://ganaz.app.link/?action=wsp&p=+${phoneNumber.country_code}${phoneNumber.local_number}`;
                }
              } else {
                const companyName = senderCmpy ? senderCmpy.name.en + ':' : '';
                // Onboarding users - SMS will be sent to the onboarding-user.
                messageBody = `${companyName} "${body.message.es}`;
                if (body.metadata && body.metadata.map && body.metadata.map.loc) {
                  const loc = body.metadata.map.loc;
                  const lng = loc[0];
                  const lat = loc[1];
                  messageBody += ` http://maps.google.com/maps?q=${lat},${lng}`;
                }
                messageBody += `" Por favor instale la aplicación Ganaz hacienda click aquí --> https://ganaz.app.link/?action=wsp&p=+${phoneNumber.country_code}${phoneNumber.local_number}`;
              }
              const smsLog = new Smslog({
                sender: {user_id: senderUserId, company_id: senderCompanyId},
                receiver: {phone_number: phoneNumber},
                message: messageBody
              });
              return smsLog.save();
            };
            for (let i = 0; i < myworkerInviteMessageForOnboardingWorkerModels.length; i++) {
              const models = myworkerInviteMessageForOnboardingWorkerModels[i];
              const userId = models.message.receiver.user_id;
              const user = userIdMap.get(userId);
              if (user.phone_number && user.phone_number.local_number) {
                saveSmsLogPromises.push(saveSmsLog(user.phone_number));
              } else {
                logger.warn('[Message Service] Not sending SMS. User ' + userId + ' has no phone_number.')
              }
            }
            // Not-registered users - SMS will be sent to the onboarding-user.
            for (let i = 0; i < userInviteMyworkerMessageModels.length; i++) {
              saveSmsLogPromises.push(saveSmsLog(userInviteMyworkerMessageModels[i].invite.phone_number));
            }
            return Promise.all(saveSmsLogPromises).then(function(savedSmsLogs) {
              let counter = 0;
              const sendSms = function(models) {
                twiliophoneService.sendSmsLogByWorker(savedSmsLogs[counter], models.myworker);
                counter++;
              };
              for (let i = 0; i < myworkerInviteMessageForOnboardingWorkerModels.length; i++) {
                sendSms(myworkerInviteMessageForOnboardingWorkerModels[i]);
              }
              for (let i = 0; i < userInviteMyworkerMessageModels.length; i++) {
                sendSms(userInviteMyworkerMessageModels[i]);
              }
              return [savedMessage];
            });
          });
        });
      });
    })
  })
};

const updateStatus = function (id, status, currentUser) {
  return Message.findById(id).then(function (message) {
    if (!message) {
      return Promise.reject('Message with id ' + id + ' does not exists.');
    } else {
      return message;
    }
  }).then(function (message) {
    return _updateMessageStatus(message, status, currentUser);
  });
};

const updateStatusByBulk = function (messageIds, status, currentUser) {
  return Message.find({_id: {$in: messageIds}}).then(function (messages) {
    const saveMessagePromises = [];
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      saveMessagePromises.push(_updateMessageStatus(message, status, currentUser));
    }
    return Promise.all(saveMessagePromises);
  });
};

function _updateMessageStatus(message, status, currentUser) {
  if (message.receivers) { // Since 1.7
    const receivers = message.receivers;
    for (let i = 0; i < receivers.length; i++) {
      const receiver = receivers[i];
      if (receiver.user_id === currentUser.id) {
        if (currentUser.company) {
          if (currentUser.company.company_id === receiver.company_id) {
            receiver.status = status;
          }
        } else if (!receiver.company_id) {
          receiver.status = status;
        }
      }
    }
  } else {
    // For backward compatibility with < 1.7
    message.status = status;
  }
  return message.save();
}

module.exports = {
  find: find,
  findById: findById,
  create: create,
  updateStatus: updateStatus,
  updateStatusByBulk: updateStatusByBulk
};
