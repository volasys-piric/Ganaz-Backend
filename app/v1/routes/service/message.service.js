const Promise = require('bluebird');
const db = require('./../../db');
const sendNotification = require('./../../../push_notification');

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
  for (let i = 0; i < receivers.length; i++) {
    body.receiver = receivers[i];
    const message = new Message(body);
    saveMessagePromises.push(message.save());
  }
  return Promise.all(saveMessagePromises).then(function (savedMessages) {
    for (let i = 0; i < savedMessages.length; i++) {
      // Send message to user/receiver ignoring result
      User.findById(savedMessages.receiver.user_id).then(function (user) {
        const jsonMessage = savedMessages[i].toObject();
        let contents = null;
        if (typeof jsonMessage.message === 'object') {
          contents = jsonMessage.message
        } else {
          // Assumed to be string
          contents = {'en': jsonMessage.message}
        }
        let notification = {
          contents: contents,
          data: {
            type: jsonMessage.type,
            contents: {id: jsonMessage._id.toString()}
          }
        };
        if (jsonMessage.type == 'message') {
          notification.data.contents.message = jsonMessage.message;
        } else if (jsonMessage.type == 'application') {
          notification.data.contents.job_id = req.body.application_id;
        }
        sendNotification(user.player_ids, notification);
      });
    }
    return savedMessages;
  })
};

const updateStatus = function (id, status) {
  const messageId = req.params.id;
  Message.findById(messageId).then(function (message) {
    if (message === null) {
      return Promise.reject('Message with id ' + messageId + ' does not exists.');
    } else {
      return message;
    }
  }).then(function (message) {
    message.status = status;
    return message.save();
  });
};

module.exports = {
  find: find,
  findById: findById,
  create: create,
  updateStatus: updateStatus
};