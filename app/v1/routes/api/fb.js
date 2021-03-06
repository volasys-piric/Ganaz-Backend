const express = require('express');
const router = express.Router();
const request = require('request');
const appConfig = require('./../../../app_config');
const httpUtil = require('./../../../utils/http');
const logger = require('./../../../utils/logger');
const fbService = require('./../service/fb.service');
const db = require('./../../db');
const FbPageInfo = db.models.fbpageinfo;

const PAGE_ACCESS_TOKEN = appConfig.FB_PAGE_ACCESS_TOKEN;

router.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  logger.info(`[FB Webhook] FB Query params - mode: [${mode}]   token: [${token}]    challenge: [${challenge}]`);
  // Check if a token and mode were sent
  if (mode && token) {
    token = token.trim();
    // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === appConfig.FB_VERIFY_TOKEN) {
      // Respond with 200 OK and challenge token from the request
      logger.info('[FB Webhook] WEBHOOK_VERIFIED');
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
  // See https://developers.facebook.com/docs/messenger-platform/getting-started/webhook-setup
  // Parse the request body from the POST
  let body = req.body;
  // Check the webhook event is from a Page subscription
  if (body && body.object === 'page') {
    fbService.processWebhook(body).then((fbwebook) => {
      let msg = fbwebook.response;
      if (!msg) {
        msg = JSON.stringify(fbwebook.exception);
      }
      logger.info(`[FB Webhook] ${msg}`);
      res.status(200).send(msg);
    }).catch(httpUtil.handleError(res));
  } else {
    // Return a '404 Not Found' if event is not from a page subscription
    logger.error(`[FB Webhook] Expected body.object is 'page', got ${body ? body.object : ''}`);
    res.sendStatus(404);
  }
});
router.get('/pageinfo/dt', (req, res) => {
  // See See https://datatables.net/manual/server-side#Sent-parameters for request parameters
  const q = req.query;
  const draw = parseInt(q.draw);
  const start = parseInt(q.start);
  const length = parseInt(q.length);
  const searchString = q.search.value;
  const dbQ = {};
  if (searchString) {
    const regex = new RegExp(searchString, 'i');
    dbQ.$or = [{'title': regex}, {'page_id': regex}, {'page_access_token': regex}];
  }
  return fbService.findAllPageInfo(dbQ, start, length).then(result => {
    res.json({draw, ...result});
  }).catch(httpUtil.handleError(res));
});
router.get('/pageinfo/:id', (req, res) => {
  return fbService.saveOrUpdatePageInfo(req.body, req.params.id).then(result => {
    res.json({success: true, info: result});
  }).catch(httpUtil.handleError(res));
});
router.post('/pageinfo', (req, res) => {
  return fbService.saveOrUpdatePageInfo(req.body).then(result => {
    res.json({success: true, infos: result});
  }).catch(httpUtil.handleError(res));
});
router.patch('/pageinfo/:id', (req, res) => {
  return FbPageInfo.findById(req.params.id).then(fbPageInfo => {
    Object.assign(fbPageInfo, req.body);
    return fbPageInfo.save().then(() => {
      const o = fbPageInfo.toObject();
      delete o.__v;
      res.json({success: true, info: o});
    });
  }).catch(httpUtil.handleError(res));
});
router.delete('/pageinfo/:id', (req, res) => {
  return FbPageInfo.findByIdAndRemove(req.params.id).then(() => {
    res.json({success: true});
  }).catch(httpUtil.handleError(res));
});
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
