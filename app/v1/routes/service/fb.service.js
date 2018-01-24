const Promise = require('bluebird');
const rp = require('request-promise');
const appConfig = require('./../../../app_config');
const db = require('./../../db');

const User = db.models.user;
const Message = db.models.message;
const FbMessage = db.models.fbmessage;

module.exports = {
  sendMesssage: (body) => {
    // https://bitbucket.org/volasys-ss/ganaz-backend/issues/34/backend-v110-change-log#markdown-header-facebook-messenger-send-api
    if (!body.message || !(body.message.en || body.message.es) || !body.receivers || body.receivers.length < 1) {
      return Promise.reject('Request body message.en or message.es and body.receivers are required.');
    } else if (body.type !== 'facebook-message' || !body.sender || !body.sender.user_id || !body.sender.company_id) {
      return Promise.reject('Request body type should be \'facebook-message\' and sender.user_id and sender.company_id are required.');
    } else {
      const promises = [];
      for (let i = 0; i < body.receivers.length; i++) {
        promises.push(User.findById(body.receivers[i].user_id));
      }
      return Promise.all(promises).then(function(users) {
        const noPsids = [];
        for (let i = 0; i < users.length; i++) {
          // Make sure all users have PSIDs
          const user = users[i];
          if (!user.worker || !user.worker.facebook_lead || !user.worker.facebook_lead) {
            noPsids.push(user._id.toString());
          }
        }
        if (noPsids.length > 0) {
          return Promise.reject(`User ids ${noPsids.toString()} have no psid.`);
        } else {
          const messageModel = new Message(body);
          return messageModel.save().then(function(messageModel) {
            const messageBody = body.message.en ? body.message.en : body.message.es;
            for (let i = 0; i < users.length; i++) {
              (function(user) {
                const psid = user.worker.facebook_lead.psid;
                const fbMessage = new FbMessage({
                  message_id: messageModel._id,
                  request: {
                    messaging_type: 'RESPONSE',
                    recipient: {id: psid},
                    message: {text: messageBody}
                  }
                });
                // Send asynchronously
                fbMessage.save().then(function(fbMessage) {
                  rp.post(`https://graph.facebook.com/v2.6/me/messages?access_token=${appConfig.FB_PAGE_ACCESS_TOKEN}`, {
                    json: true,
                    body: fbMessage.request,
                    headers: {version: 1.9}
                  }).then(function(response) {
                    fbMessage.response = response;
                    fbMessage.save();
                  }).catch(function(err) {
                    fbMessage.exception = err;
                    fbMessage.save();
                  })
                });
              })(users[i]);
            }
            return [messageModel];
          });
        }
      });
    }
  }
};