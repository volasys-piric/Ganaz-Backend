const Promise = require('bluebird');
const db = require('./../../db');
const twilioService = require('./twilio.service');
const sendNotification = require('./../../../push_notification');
const logger = require('./../../../utils/logger');

const Message = db.models.message;
const User = db.models.user;
const Company = db.models.company;

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

const create = function (body) {
  // TODO: Add validation such that job_id (if not null) and sender/receiver iuser_id and company_id (if not null) should be existing.
  const saveMessagePromises = [];
  if (body.receivers) {
    const receivers = body.receivers;
    if (receivers.length) {
      const userIds = [];
      for (let i = 0; i < receivers.length; i++) {
        const receiver = receivers[i];
        if (userIds.indexOf(receiver.user_id) === -1) {
          // Avoid duplicate creation of messaqge for same user id
          userIds.push(receiver.user_id);
          body.receiver = receiver;
          const message = new Message(body);
          saveMessagePromises.push(message.save());
        }
      }
    } else {
      const message = new Message(body);
      saveMessagePromises.push(message.save());
    }
  }
  const sendPushNotification = function (user, savedMessage) {
    const jsonMessage = savedMessage.toObject();
    let messageString = null;
    if (typeof jsonMessage.message === 'object') {
      messageString = jsonMessage.message.en;
    } else {
      // Assumed to be string
      messageString = jsonMessage.message;
    }
    const messageId = jsonMessage._id.toString();
    const data = {type: jsonMessage.type};
    data.contents = {
      id: messageId,
      message_id: messageId,
      message: messageString,
    };
    if (body.job_id) {
      // For backward compatibility
      data.contents.job_id = body.job_id
    }
    if (jsonMessage.type === 'application') {
      data.contents.application_id = body.metadata.application_id;
    } else if (jsonMessage.type === 'recruit') {
      data.contents.recruit_id = body.metadata.recruit_id;
    } else if (jsonMessage.type === 'suggest') {
      data.contents.suggest_id = body.metadata.suggest_id;
      data.contents.suggested_phone_number = body.metadata.suggested_phone_number;
    }
    sendNotification(user.player_ids, {contents: {en: messageString}, data: data});
  };

  return Promise.all(saveMessagePromises).then(function (savedMessages) {
    for (let i = 0; i < savedMessages.length; i++) {
      // Send message to user/receiver ignoring result
      const savedMessage = savedMessages[i];
      if (savedMessage.receiver && savedMessage.receiver.user_id) {
        User.findById(savedMessage.receiver.user_id).then(function (user) {
          if (user) {
            if (user.player_ids) {
              sendPushNotification(user, savedMessage);
            } else {
              logger.warn('[Message Service] Not sending push notification. User with id ' + savedMessage.receiver.user_id + ' has no player_ids.');
            }
          } else {
            logger.warn('[Message Service] Not sending push notification. User with id ' + savedMessage.receiver.user_id + ' not found.');
          }
        });
      } else {
        logger.info('[Message Service] Not sending push notification. Message id ' + savedMessage._id.toString() + ' has no receiver.');
      }
    }
    return savedMessages;
  }).then(function (savedMessages) {
    // https://bitbucket.org/volasys-ss/ganaz-backend/wiki/7.3%20Message%20-%20Create#markdown-header-change-log-v14
    if (body.receivers_phone_numbers) {
      const findUserPromises = [];
      for (let i = 0; i < body.receivers_phone_numbers.length; i++) {
        const localNumber = body.receivers_phone_numbers[i];
        findUserPromises.push(User.findOne({'phone_number.local_number': localNumber}));
      }
      return Promise.all(findUserPromises).then(function (users) {
        const saveMessagePromises = [];
        const validUsers = []; // Holder of user. We'll need this later
        const noUserPhoneNumbers = [];
        const existingReceiverUserIds = []; // Avoid duplicate creation of Message
        for (let i = 0; i < savedMessages.length; i++) {
          existingReceiverUserIds.push(savedMessages[i].receiver.user_id);
        }

        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          if (user !== null) {
            if (existingReceiverUserIds.indexOf(user._id.toString()) === -1) { // Avoid duplicate creation of Message
              validUsers.push(user);
              body.receiver = {user_id: user._id.toString()};
              if (user.company) {
                body.receiver.company_id = user.company.company_id;
              }
              const message = new Message(body);
              saveMessagePromises.push(message.save());
            }
          } else {
            noUserPhoneNumbers.push(body.receivers_phone_numbers[i]);
          }
        }
        return Promise.all(saveMessagePromises).then(function (additionalSavedMessages) {
          for (let i = 0; i < additionalSavedMessages.length; i++) {
            // Send message to user/receiver ignoring result
            const savedMessage = additionalSavedMessages[i];
            savedMessages.push(savedMessage);
            const user = validUsers[i];
            if (user.player_ids) {
              sendPushNotification(user, savedMessage);
            } else {
              logger.warn('[Message Service] Not sending push notification. User with id ' + savedMessage.receiver.user_id + ' has no player_ids.');
            }
          }
          if (noUserPhoneNumbers.length > 0) {
            // Send SMS asynchronously and ignore result
            Company.findById(body.sender.company_id).then(function (company) {
              const companyName = company.name.en;
              const body = companyName + ' quisiera recomendar que ud baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download';
              for (let i = 0; i < noUserPhoneNumbers.length; i++) {
                const toFullNumber = "+1" + noUserPhoneNumbers[i];
                twilioService.sendMessage(toFullNumber, body).catch(function (err) {
                  logger.warn(err);
                })
              }
            }).catch(function (err) {
              logger.error(err);
            });
          }
          return savedMessages;
        });
      });
    } else {
      return savedMessages;
    }
  });
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