const Promise = require('bluebird');
const rp = require('request-promise');
const logger = require('./../../../utils/logger');
const appConfig = require('./../../../app_config');
const pushNotification = require('./../../../push_notification');
const db = require('./../../db');
const googleService = require('./google.service');

const User = db.models.user;
const Message = db.models.message;
const FbMessage = db.models.fbmessage;
const FbWebhook = db.models.fbwebhook;
const FbPageInfo = db.models.fbpageinfo;
const Job = db.models.job;
const Myworker = db.models.myworker;

const createMessageModel = (messageBody, user, job) => {
    const userId = user._id.toString();
    const companyId = job.company_id;
    logger.info(`[FB Webhook] Translating ${messageBody} to english.`);

    return googleService.translate(messageBody).then((translations) => {
        return new Message({
            type: 'facebook-message',
            sender: {user_id: userId, company_id: ''},
            receivers: [{user_id: job.company_user_id, company_id: companyId}],
            message: {
                en: translations[0],
                es: messageBody,
            },
        });
    });
};

const findReferralAdId = (senderPsid) => {
  return FbWebhook.findOne({
    'request.entry.messaging.sender.id': senderPsid,
    'request.entry.messaging.referral.ad_id': {$exists: true}
  }).sort({datetime: -1}).then((o) => {
    if (o) {
      const jsonO = o.toObject();
      const messaging = jsonO.request.entry[0].messaging[0];
      const referral = messaging.referral;
      return referral.ad_id
    } else {
      return null;
    }
  });
};

const findPostbackAdId = (senderPsid) => {
  return FbWebhook.findOne({
    'request.entry.messaging.sender.id': senderPsid,
    'request.entry.messaging.postback.referral.ad_id': {$exists: true}
  }).sort({datetime: -1}).then((o) => {
    if (o) {
      const jsonO = o.toObject();
      const messaging = jsonO.request.entry[0].messaging[0];
      const referral = messaging.postback.referral;
      return referral.ad_id
    } else {
      return null;
    }
  })
};

const findUserByPsidAndAdIdAndJobId = (psid, adId, jobId) => {
  return User.findOne({
    'type': 'facebook-lead-worker',
    'worker.facebook_lead.psid': psid,
    'worker.facebook_lead.ad_id': adId,
    'worker.facebook_lead.job_id': jobId
  });
};

const createFacebookLeadWorker = (psid, adId, pageId, job) => {
  return new User({
    type: 'facebook-lead-worker',
    username: psid + adId,
    worker: {
      facebook_lead: {
        psid: psid,
        ad_id: adId,
        page_id: pageId,
        company_id: job.company_id,
        job_id: job._id,
      }
    }
  });
}

module.exports = {
    sendMesssage: (body) => {
        // https://bitbucket.org/volasys-ss/ganaz-backend/issues/34/backend-v110-change-log#markdown-header-facebook-messenger-send-api
        if (!body.message || !(body.message.en || body.message.es) || !body.receivers || body.receivers.length < 1) {
            return Promise.reject('Request body message.en or message.es and body.receivers are required.');
        }
        else if (body.type !== 'facebook-message' || !body.sender || !body.sender.user_id || !body.sender.company_id) {
            return Promise.reject('Request body type should be \'facebook-message\' and sender.user_id and sender.company_id are required.');
        }
        else {
            const promises = [];
            for (let i = 0; i < body.receivers.length; i++) {
                promises.push(User.findById(body.receivers[i].user_id));
            }
            return Promise.all(promises).then(function(users) {
                const noPsids = [];
                for (let i = 0; i < users.length; i++) {
                    // Make sure all users have PSIDs
                    const user = users[i];
                    if (user.type !== 'facebook-lead-worker' || !user.worker || !user.worker.facebook_lead || !user.worker.facebook_lead.psid) {
                        noPsids.push(user._id.toString());
                    }
                }
                if (noPsids.length > 0) {
                    return Promise.reject(`User ids [${noPsids.toString()}] is/are  not facebook lead worker(s).`);
                }
                else {
                    const messageModel = new Message(body);
                    return messageModel.save().then(function(messageModel) {
                        const messageBody = body.message.es ? body.message.es : body.message.en;
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
                                const pageId = user.worker.facebook_lead.page_id;
                                // Send asynchronously
                                FbPageInfo.findOne({page_id: pageId}).then(fbpageInfo => {
                                    if(fbpageInfo || fbpageInfo.page_access_token) {
                                        logger.info(`[FB Service] User ${user._id.toString()} fb page ${pageId} has no access token.`);
                                    }
                                    else {
                                        fbMessage.save().then(function(fbMessage) {
                                            rp.post(`https://graph.facebook.com/v2.6/me/messages?access_token=${fbpageInfo.page_access_token}`, {
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
                                    }
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
            const adIds = [];
            // Iterate over each entry - there may be multiple if batched
            body.entry.forEach((entry) => {
                // Get the webhook event. entry.messaging is an array, but
                // will only ever contain one event, so we get index 0
                const webhookEvent = entry.messaging[0];
                logger.info(`[FB Webhook Service] Processing webhook event: ${JSON.stringify(webhookEvent)}`);
                // Get the sender PSID
                const senderPsid = webhookEvent.sender.id;
                const pageId = webhookEvent.recipient.id;
                // Check if the event is a message or postback and
                // pass the event to the appropriate handler function
                if (webhookEvent.message) {
                    messageEvents.push({psid: senderPsid, pageId: pageId, message: webhookEvent.message});
                    processedEvents.push('MESSAGE');
                }
                else if (webhookEvent.postback) {
                    postbackEvents.push({psid: senderPsid, pageId: pageId, postback: webhookEvent.postback});
                    processedEvents.push('POSTBACKS');

                    if (webhookEvent.postback && webhookEvent.postback.referral && webhookEvent.postback.referral.ad_id) {
                        // If postback
                        adIds.push(webhookEvent.postback.referral.ad_id);
                    }
                }
                else if (webhookEvent.referral) {
                    if (webhookEvent.referral.ad_id) {
                        referralEvents.push({psid: senderPsid, pageId: pageId, referral: webhookEvent.referral});
                        processedEvents.push('REFERRALS');
                        adIds.push(webhookEvent.referral.ad_id);
                    }
                }
            });

            if (processedEvents.length < 1) {
                fbwebhook.response = {success_message: 'No events processed.'};
                return fbwebhook.save();
            }
            else {
                const findJobsByAdIds = adIds.length > 0 ? Job.find({'external_reference.facebook.ad_id': {$in: adIds}}) : Promise.resolve([]);
                return findJobsByAdIds.then((jobs) => {
                    const adIdJobMap = new Map(jobs.map((job) => [job.external_reference.facebook.ad_id, job]));
                    const psidUserMap = new Map();
                    const userIdUserMap = new Map();

                    const findUsers = (events) => {
                        const findUserPromises = [];
                        for (let i = 0; i < events.length; i++) {
                            const event = events[i];

                            let adId = (event.referral && event.referral.ad_id) ? (event.referral.ad_id) : ((event.postback && event.postback.referral && event.postback.referral.ad_id) ? event.postback.referral.ad_id : "");
                            if (adId === "") continue;

                            let job = adIdJobMap.get(adId);
                            if (!job || !job._id) continue;

                            findUserPromises.push(User.findOne({
                                'type': 'facebook-lead-worker',
                                'worker.facebook_lead.psid': event.psid,
                                'worker.facebook_lead.job_id': job._id
                            }));
                        }
                        return Promise.all(findUserPromises).then((users) => {
                            const foundUsers = [];
                            for (let i = 0; i < users.length; i++) {
                                const user = users[i];
                                if (user) {
                                    foundUsers.push(user);
                                    userIdUserMap.set(user._id.toString(), user);
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
                        events = events.filter((event) => {
                            // Only consider events with ad_id
                            return (event.referral && event.referral.ad_id) || (event.postback && event.postback.referral && event.postback.referral.ad_id);
                        });
                        if (events.length < 1) {
                            return Promise.resolve([]);
                        }

                        return findUsers(events).then(() => {
                            const saveUserPromises = [];
                            for (let i = 0; i < events.length; i++) {
                                const event = events[i];
                                let user = psidUserMap.get(event.psid);
                                if (!user) {
                                    let adId = null; // should never be null. see event.filter above.
                                    if (event.referral && event.referral.ad_id) {
                                        // If referral
                                        adId = event.referral.ad_id;
                                    }
                                    else if (event.postback && event.postback.referral && event.postback.referral.ad_id) {
                                        // If postback
                                        adId = event.postback.referral.ad_id;
                                    }
                                    const job = adIdJobMap.get(adId);
                                    if (job) {
                                        user = createFacebookLeadWorker(event.psid, adId, event.pageId, job);
                                        saveUserPromises.push(user.save());
                                    }
                                    else {
                                        logger.info(`[FB Webhook Service] Not creating records. No job associated to ad id ${adId}.`);
                                    }
                                }
                                else {
                                    saveUserPromises.push(Promise.resolve(user));
                                }
                            }
                            return Promise.all(saveUserPromises);
                        }).then((savedUsers) => {
                            const findMyworkerPromises = [];
                            for (let i = 0; i < savedUsers.length; i++) {
                                const user = savedUsers[i];
                                userIdUserMap.set(user._id.toString(), user);
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
                    }).then(() => {
                        // Process postback messages if there's any.
                        const adIdPromises = [];
                        for (let i = 0; i < postbackEvents.length; i++) {
                            const event = postbackEvents[i];
                            const messageBody = event.postback.payload;
                            if (messageBody) {
                                if (event.postback && event.postback.referral && event.postback.referral.ad_id) {
                                    const adId = event.postback.referral.ad_id;
                                    adIdPromises.push(Promise.resolve(adId)); // represents event.postback.referral.ad_id
                                    adIdPromises.push(Promise.resolve(adId)); // represents event.referral.ad_id
                                }
                                else {
                                    adIdPromises.push(findPostbackAdId(event.psid));
                                    adIdPromises.push(findReferralAdId(event.psid));
                                }
                            }
                        }
                        return Promise.all(adIdPromises).then((adIds) => {
                            const findUserPromises = [];
                            let counter = 0;
                            for (let i = 0; i < postbackEvents.length; i++) {
                                const event = postbackEvents[i];
                                const messageBody = event.postback.payload;
                                if (messageBody) {
                                    const postbackAdId = adIds[counter++];
                                    const refAdId = adIds[counter++];
                                    if (postbackAdId || refAdId) {
                                        const adId = postbackAdId ? postbackAdId : refAdId;
                                        let job = adIdJobMap.get(adId);
                                        if (!job) continue;

                                        findUserPromises.push(findUserByPsidAndAdIdAndJobId(event.psid, adId, job._id).then((user) => {
                                            return {user, messageBody, adId, event}
                                        }));
                                    }
                                    else {
                                        logger.info(`[FB Webhook Service] Cannot determine ad id. Ignoring event ${JSON.stringify(event)}.`);
                                    }
                                }
                            }
                            return Promise.all(findUserPromises);
                        }).then((results) => {
                            const findJobPromises = [];
                            for (let i = 0; i < results.length; i++) {
                                const o = results[i];
                                const adId = o.adId;
                                findJobPromises.push(Job.findOne({'external_reference.facebook.ad_id': adId}).then((job) => {
                                    return {...o, job}
                                }))
                            }
                            return Promise.all(findJobPromises);
                        }).then((results) => {
                            const unsavedMessages = [];
                            for (let i = 0; i < results.length; i++) {
                                const o = results[i];
                                const adId = o.adId;
                                const user = o.user;
                                const job = o.job;
                                if (user && job) {
                                    userIdUserMap.set(user._id.toString(), user);
                                    unsavedMessages.push(createMessageModel(o.messageBody, user, job));
                                }
                                else {
                                    const event = o.event;
                                    let message = '';
                                    if (!user) {
                                        message += `No user found for PSID-AdId [${event.psid}-${adId}]. `
                                    }
                                    if (!job) {
                                        message += `No job found for Ad Id [${adId}]. `
                                    }
                                    logger.info(`[FB Webhook Service] ${message} Ignoring event ${JSON.stringify(o.event)}.`);
                                }
                            }
                            return Promise.all(unsavedMessages);
                        });
                    }).then((unsavedMessages) => {
                        const adIdPromises = [];
                        for (let i = 0; i < messageEvents.length; i++) {
                            const event = messageEvents[i];
                            let messageBody = event.message.text;
                            if (!messageBody) {
                                if (event.message.attachments && event.message.attachments.length > 0) {
                                    messageBody = event.message.attachments[0].payload;
                                }
                            }
                            if (messageBody) {
                                adIdPromises.push(findPostbackAdId(event.psid));
                                adIdPromises.push(findReferralAdId(event.psid));
                            }
                        }
                        return Promise.all(adIdPromises).then((adIds) => {
                            const messagesPromises = [];
                            let counter = 0;
                            for (let i = 0; i < messageEvents.length; i++) {
                                const event = messageEvents[i];
                                let messageBody = event.message.text;
                                if (!messageBody) {
                                    if (event.message.attachments && event.message.attachments.length > 0) {
                                        messageBody = event.message.attachments[0].payload;
                                    }
                                }
                                if (messageBody) {
                                    const postbackAdId = adIds[counter++];
                                    const refAdId = adIds[counter++];
                                    if (postbackAdId || refAdId) {
                                        const adId = postbackAdId ? postbackAdId : refAdId;
                                        messagesPromises.push({messageBody, adId, event});
                                    }
                                    else {
                                        logger.info(`[FB Webhook Service] Cannot determine ad id. Ignoring event ${JSON.stringify(event)}.`);
                                    }
                                }
                            }
                            return Promise.all(messagesPromises);
                        }).then((results) => {
                            const findJobPromises = [];
                            for (let i = 0; i < results.length; i++) {
                                const o = results[i];
                                const adId = o.adId;
                                findJobPromises.push(Job.findOne({'external_reference.facebook.ad_id': adId}).then((job) => {
                                    return {...o, job}
                                }))
                            }
                            return Promise.all(findJobPromises);
                        }).then((results) => {
                            const findUserPromises = [];
                            for (let i = 0; i < results.length; i++) {
                                const o = results[i];
                                const adId = o.adId;
                                const job = o.job;
                                const event = o.event;
                                if (!job) continue;

                                findUserPromises.push(findUserByPsidAndAdIdAndJobId(event.psid, adId, job._id).then((user) => {
                                    return {user, ...o}
                                }));
                            }
                            return Promise.all(findUserPromises);
                        }).then((results) => {
                            for (let i = 0; i < results.length; i++) {
                                const o = results[i];
                                const adId = o.adId;
                                const user = o.user;
                                const job = o.job;
                                if (user && job) {
                                    userIdUserMap.set(user._id.toString(), user);
                                    unsavedMessages.push(createMessageModel(o.messageBody, user, job));
                                }
                                else {
                                    const event = o.event;
                                    let message = '';
                                    if (!user) {
                                        message += `No user found for PSID-AdId [${event.psid}-${adId}]. `
                                    }
                                    if (!job) {
                                        message += `No job found for Ad Id [${adId}]. `
                                    }
                                    logger.info(`[FB Webhook Service] ${message} Ignoring event ${JSON.stringify(o.event)}.`);
                                }
                            }
                            return Promise.all(unsavedMessages);
                        });
                    }).then((unsavedMessages) => {
                        // Save all messages;
                        return Promise.all(unsavedMessages.map((unsavedMessage) => unsavedMessage.save()));
                    }).then(function(savedMessages) {
                        for (let i = 0; i < savedMessages.length; i++) {
                            const savedMessage = savedMessages[i];
                            const user = userIdUserMap.get(savedMessage.sender.user_id);
                            if (user.player_ids && user.player_ids.length > 0) {
                                // Send push notification asynchronously
                                pushNotification.sendMessage(user.player_ids, savedMessage);
                            }
                            else {
                                logger.warn('[Application] Not sending push notification. User with id ' + user._id.toString() + ' has no player_ids.');
                            }
                        }
                        fbwebhook.response = {
                            success_message: `
                                Events
                                processed: ${processedEvents.toString()}`
                        };
                        return fbwebhook.save();
                    }).catch(function(err) {
                        logger.error(err);
                        fbwebhook.response = {
                            exception: {
                                message: typeof err === 'string' ? err : err.message
                            }
                        };
                        return fbwebhook.save();
                    });
                });
            }
        });
    },

    saveOrUpdatePageInfo: (body, id) => {
        const findPageInfo = id ? FbPageInfo.findById(id) : Promise.resolve();
        return findPageInfo.then(model => {
            if (!model) {
                model = new FbPageInfo(body);
            }
            return model.save();
        });
    },
    findAllPageInfo: (dbQ, start, length) => {
        const promises = [
            FbPageInfo.count(),
            FbPageInfo.count(dbQ),
            FbPageInfo.find(dbQ).skip(start).limit(length)
        ];
        return Promise.all(promises).then(function (promiseResultArr) {
            const recordsTotal = promiseResultArr[0];
            const recordsFiltered = promiseResultArr[1];
            const data = promiseResultArr[2].map(m => {
                const o = m.toObject();
                delete o.__v;
                return o
            });
            return {recordsTotal, recordsFiltered, data};
        });
    }
};
