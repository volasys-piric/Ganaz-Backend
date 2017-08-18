const Promise = require('bluebird');
const db = require('./../../db');
const sendNotification = require('./../../../push_notification');
const logger = require('./../../../utils/logger');

const Message = db.models.message;
const User = db.models.user;

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
  const receivers = body.receivers;
  const saveMessagePromises = [];
  if (receivers.length > 0) {
    for (let i = 0; i < receivers.length; i++) {
      body.receiver = receivers[i];
      const message = new Message(body);
      saveMessagePromises.push(message.save());
    }
  } else {
    const message = new Message(body);
    saveMessagePromises.push(message.save());
  }
  return Promise.all(saveMessagePromises).then(function (savedMessages) {
    for (let i = 0; i < savedMessages.length; i++) {
      // Send message to user/receiver ignoring result
      const savedMessage = savedMessages[i];
      if (savedMessage.receiver && savedMessage.receiver.user_id) {
        User.findById(savedMessage.receiver.user_id).then(function (user) {
          if (user) {
            if (user.player_ids) {
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
            } else {
              logger.warn('Not sending push notification. User with id ' + savedMessage.receiver.user_id + ' has no player_ids.');
            }
          } else {
            logger.warn('Not sending push notification. User with id ' + savedMessage.receiver.user_id + ' not found.');
          }
        });
      } else {
        logger.info('Not sending push notification. Message id ' + savedMessage._id.toString() + ' has no receiver.');
      }
    }
    return savedMessages;
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