const express = require('express');
const router = express.Router();
const Promise = require('bluebird');
const request = require('request');
const appConfig = require('./../../../app_config');
const pushNotification = require('./../../../push_notification');
const logger = require('./../../../utils/logger');
const db = require('./../../db');

const FbWebhook = db.models.fbwebhook;

const PAGE_ACCESS_TOKEN = appConfig.FB_PAGE_ACCESS_TOKEN;

router.get('/webhook', (req, res) => {
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];
  // Check if a token and mode were sent
  if (mode && token) {
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === appConfig.FB_VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);
    } else {
      // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(403);
  }
});

// Accepts POST requests at /webhook endpoint
router.post('/webhook', (req, res) => {
  // Parse the request body from the POST
  let body = req.body;
  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {
    const fbwebhook = new FbWebhook(body);
    fbwebhook.save().then(function(fbwebhook) {
      const processedEvents = [];
      const promises = [];
      const messageEvents = [];
      const postbackEvents = [];
      const referralEvents = [];
      // Iterate over each entry - there may be multiple if batched
      body.entry.forEach(function(entry) {
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
        } else if (webhookEvent.postback) {
          postbackEvents.push({psid: senderPsid, pageId: pageId, postback: webhookEvent.postback});
        } else if (webhookEvent.referral) {
          referralEvents.push({psid: senderPsid, pageId: pageId, referral: webhookEvent.referral});
        }
      });
      if (processedEvents.length < 1) {
        processedEvents.push('NONE');
      }
      // Return a '200 OK' response to all events
      res.status(200).send('EVENT_RECEIVED');
    });
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }
});

/**
 * Handles messaging_postbacks events.
 *
 * @param senderPsid
 * @param pageId
 * @param receivedMessage
 * @see https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messages
 */
function handleMessage(senderPsid, pageId, receivedMessage) {
  let response;
  // Checks if the message contains text
  if (receivedMessage.text) {
    // Creates the payload for a basic text message, which
    // will be added to the body of our request to the Send API
    response = {
      "text": `You sent the message: "${receivedMessage.text}". Now send me an attachment!`
    }
  } else if (receivedMessage.attachments) {
    // Gets the URL of the message attachment
    let attachment_url = receivedMessage.attachments[0].payload.url;
  }
  // Sends the response message
  callSendAPI(senderPsid, response);
}

/**
 * Handles messaging_postbacks events.
 *
 * @param senderPsid
 * @param pageId
 * @param receivedPostback
 * @see https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messaging_postbacks
 */
function handlePostback(senderPsid, pageId, receivedPostback) {
  let response;
  // Get the payload for the postback
  let payload = receivedPostback.payload;
  // Set the response based on the postback payload
  // if (payload === 'yes') {
  //   response = { "text": "Thanks!" }
  // } else if (payload === 'no') {
  //   response = { "text": "Oops, try sending another image." }
  // }
  // // Send the message to acknowledge the postback
  // callSendAPI(senderPsid, response);
}

/**
 * Handles messaging_referrals events.
 *
 * @param senderPsid
 * @param pageId
 * @param referralBody
 * @see https://developers.facebook.com/docs/messenger-platform/reference/webhook-events/messaging_referrals
 */
function handleReferral(senderPsid, pageId, referralBody) {

}

// Sends response messages via the Send API
function callSendAPI(senderPsid, response) {
  // Construct the message body
  let request_body = {
    "recipient": {
      "id": senderPsid
    },
    "message": response
  };
  
  // Send the HTTP request to the Messenger Platform
  request({
    "uri": "https://graph.facebook.com/v2.6/me/messages",
    "qs": {"access_token": PAGE_ACCESS_TOKEN},
    "method": "POST",
    "json": request_body
  }, (err, res, body) => {
    if (!err) {
      console.log('message sent!')
    } else {
      console.error("Unable to send message:" + err);
    }
  });
}

module.exports = router;