const Promise = require('bluebird');
const rp = require('request-promise');
const logger = require('./../../../utils/logger');
const appConfig = require('./../../../app_config');
const db = require('./../../db');

const User = db.models.user;
const Message = db.models.message;
const FbMessage = db.models.fbmessage;
const FbWebhook = db.models.fbwebhook;
const Job = db.models.job;
const Myworker = db.models.myworker;

const createMessageModel = (messageBody, user, job) => {
  const userId = user._id.toString();
  const companyId = job.company_id;
  const message = new Message({
    type: 'facebook-message',
    sender: {user_id: userId, company_id: companyId},
    receivers: [{user_id: job.company_user_id, company_id: companyId}],
    message: {
      en: messageBody,
      es: messageBody,
    },
  });
  return message;
};

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
          if (!user.worker || !user.worker.facebook_lead || !user.worker.facebook_lead.psid) {
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
  },
  processWebhook: (body) => {
    const fbwebhook = new FbWebhook({request: body});
    return fbwebhook.save().then((fbwebhook) => {
      const processedEvents = [];
      const messageEvents = [];
      const postbackEvents = [];
      const referralEvents = [];
      const pageIds = [];
      // Iterate over each entry - there may be multiple if batched
      body.entry.forEach((entry) => {
        // Get the webhook event. entry.messaging is an array, but
        // will only ever contain one event, so we get index 0
        const webhookEvent = entry.messaging[0];
        logger.info('[FB Webhook API] Processing webhook event: ' + JSON.stringify(webhookEvent));
        // Get the sender PSID
        const senderPsid = webhookEvent.sender.id;
        const pageId = webhookEvent.recipient.id;
        // Check if the event is a message or postback and
        // pass the event to the appropriate handler function
        if (webhookEvent.message) {
          messageEvents.push({psid: senderPsid, pageId: pageId, message: webhookEvent.message});
          processedEvents.push('MESSAGE');
          pageIds.push(pageId);
        } else if (webhookEvent.postback) {
          postbackEvents.push({psid: senderPsid, pageId: pageId, postback: webhookEvent.postback});
          processedEvents.push('POSTBACKS');
          pageIds.push(pageId);
        } else if (webhookEvent.referral) {
          if (webhookEvent.referral.ad_id) {
            referralEvents.push({psid: senderPsid, pageId: pageId, referral: webhookEvent.referral});
            processedEvents.push('REFERRALS');
            pageIds.push(pageId);
          }
        }
      });
      if (processedEvents.length < 1) {
        fbwebhook.response = {success_message: 'No events processed.'};
        return fbwebhook.save();
      } else {
        return Job.find({'external_reference.facebook.page_id': {$in: pageIds}}).then((jobs) => {
          if (jobs.length < 1) {
            const msg = `No jobs associated to page ids: [${pageIds.toString()}]`;
            fbwebhook.response = {success_message: `Events processed: ${processedEvents.toString()}. ${msg}`};
            return fbwebhook.save();
          }
          const pageIdJobMap = new Map(jobs.map((job) => [job.external_reference.facebook.page_id, job]));
          const psidUserMap = new Map();
          const findUsers = (events) => {
            const findUserPromises = [];
            for (let i = 0; i < events.length; i++) {
              const event = events[i];
              findUserPromises.push(User.findOne({
                'type': 'facebook-lead-worker',
                'worker.facebook_lead.psid': event.psid
              }));
            }
            return Promise.all(findUserPromises).then((users) => {
              const foundUsers = [];
              for (let i = 0; i < users.length; i++) {
                const user = users[i];
                if (user) {
                  foundUsers.push(user);
                  const psid = user.worker.facebook_lead.psid;
                  if (!psidUserMap.has(psid)) {
                    psidUserMap.set(psid, user);
                  }
                }
              }
              return foundUsers;
            });
          };
          const saveUsers = (events) => {
            if (events.length < 1) {
              return Promise.resolve([]);
            }
            return findUsers(events).then((foundUsers) => {
              const saveUserPromises = [];
              for (let i = 0; i < events.length; i++) {
                const event = events[i];
                let user = psidUserMap.get(event.pageId);
                if (!user) {
                  const job = pageIdJobMap.get(event.pageId);
                  user = new User({
                    type: 'facebook-lead-worker',
                    username: event.psid,
                    worker: {
                      facebook_lead: {
                        psid: event.psid,
                        page_id: event.pageId,
                        company_id: job.company_id,
                        job_id: job._id,
                      }
                    }
                  });
                }
                
                if (event.referral && event.referral.ad_id) {
                  // If referral
                  user.worker.facebook_lead.ad_id = event.referral.ad_id;
                } else if (event.postback && event.postback.referral && event.postback.referral.ad_id) {
                  // If postback
                  user.worker.facebook_lead.ad_id = event.postback.referral.ad_id;
                }
                saveUserPromises.push(user.save());
              }
              return Promise.all(saveUserPromises);
            }).then((savedUsers) => {
              const findMyworkerPromises = [];
              for (let i = 0; i < savedUsers.length; i++) {
                const user = savedUsers[i];
                const companyId = user.worker.facebook_lead.company_id.toString();
                findMyworkerPromises.push(Myworker.findOne({
                  company_id: companyId,
                  worker_user_id: user._id.toString()
                }));
              }
              return Promise.all(findMyworkerPromises).then((myworkers) => {
                const saveMyworkerPromises = [];
                for (let i = 0; i < myworkers.length; i++) {
                  if (!myworkers[i]) {
                    const user = savedUsers[i];
                    const companyId = user.worker.facebook_lead.company_id.toString();
                    const myworker = new Myworker({
                      company_id: companyId,
                      worker_user_id: user._id.toString()
                    });
                    saveMyworkerPromises.push(myworker.save());
                  }
                }
                return Promise.all(saveMyworkerPromises);
              }).then(() => {
                return savedUsers;
              })
            });
          };
          
          // Save referrals first
          return saveUsers(referralEvents).then(() => {
            // Then postback events
            return saveUsers(postbackEvents);
          }).then((postbackUsers) => {
            // Process postback events if there's any.
            const unsavedMessages = [];
            for (let i = 0; i < postbackEvents.length; i++) {
              const event = postbackEvents[i];
              const messageBody = event.postback.payload;
              if (messageBody) {
                const user = postbackUsers[i];
                const job = pageIdJobMap.get(event.pageId);
                unsavedMessages.push(createMessageModel(messageBody, user, job));
              }
            }
            return unsavedMessages;
          }).then((unsavedMessages) => {
            return saveUsers(messageEvents).then(function(messageUsers) {
              for (let i = 0; i < messageEvents.length; i++) {
                const event = messageEvents[i];
                let messageBody = event.message.text;
                if (!messageBody) {
                  if (event.message.attachments && event.message.attachments.length > 0) {
                    messageBody = event.message.attachments[0].payload;
                  }
                }
                if (messageBody) {
                  const user = messageUsers[i];
                  const job = pageIdJobMap.get(event.pageId);
                  unsavedMessages.push(createMessageModel(messageBody, user, job));
                }
              }
              return unsavedMessages;
            });
          }).then((unsavedMessages) => {
            // Save all messages;
            return Promise.all(unsavedMessages.map((unsavedMessage) => unsavedMessage.save()));
          }).then(function(savedMessages) {
            // TODO: What to do with savedMessages?
            fbwebhook.response = {success_message: `Events processed: ${processedEvents.toString()}`};
            return fbwebhook.save();
          }).catch(function(err) {
            fbwebhook.response = {exception: err};
            return fbwebhook.save();
          })
        });
      }
    });
  }
};