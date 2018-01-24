const express = require('express');
const router = express.Router();
const messageService = require('./../service/message.service');
const fbService = require('./../service/fb.service');
const httpUtil = require('./../../../utils/http');

router.post('/search', function (req, res) {
  /** Expected req.body
   {
       "user_id": "{user object id}",                [optional]
       "company_id": "{company object id}"           [optional]
   }
   */
  messageService.find(req.body).then(function (messages) {
    res.json({
      success: true,
      messages: messages
    });
  }).catch(httpUtil.handleError(res));
});

router.get('/:id', function (req, res) {
  messageService.findById(req.params.id).then(function (message) {
    res.json({
      success: true,
      message: message
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/', function (req, res) {
  /** Expected req.body
   {
       "job_id": "{id of job related to this message, empty string if no job is related}",
       "type": "message/recruit/application/facebook-message",
       "sender": {
           "user_id": "{user object id}",
           "company_id": "{company object id, empty in case of worker}"
       },
       "receivers": [                                            [optional]
           {
               "user_id": "{user object id}",
               "company_id": "{company object id, empty in case of worker}"
           },
           {
               "user_id": "{user object id}",
               "company_id": "{company object id, empty in case of worker}"
           },
           ...
       ],
       "receivers_phone_numbers": [                               [optional]
           {local phone number},
           {local phone number},
           ...
       ],
       "message": {
           "en": "{Message in English}",
           "es": "{Message in Spanish}"
       },
       "metadata": {
           ....
       },
       "auto_translate": true/false
   }
   */
  const body = req.body;
  if (!body.sender.company_id) {
    body.sender.company_id = "";
  }
  let promise = null;
  if (body.type === 'facebook-message') {
    promise = fbService.sendMesssage(body);
  } else {
    promise = messageService.create(body);
  }
  promise.then(function(messages) {
    res.json({
      success: true,
      messages: messages
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/:id/status', function (req, res) {
  /** Expected req.body
   {
       "status": "read/new"
   }
   */
  const body = req.body;
  if (!body || !body.status) {
    res.json({
      success: false,
      msg: 'Request body status is required.'
    });
  } else {
    messageService.updateStatus(req.params.id, body.status, req.user).then(function (message) {
      res.json({
        success: true,
        message: message
      });
    }).catch(httpUtil.handleError(res));
  }
});

router.post('/status-update', function (req, res) {
  /** Expected req.body
   {
       "message_ids": [
           "{message id}",
           "{message id}",
           ...
       ],
       "status": "read/new"
   }
   */
  const body = req.body;
  if (!body || !body.status) {
    res.json({
      success: false,
      msg: 'Request body status is required.'
    });
  } else {
    messageService.updateStatusByBulk(body.message_ids, body.status, req.user).then(function (messages) {
      res.json({
        success: true,
        messages: messages.map(function (message) {
          return message._id.toString()
        })
      });
    }).catch(httpUtil.handleError(res));
  }
});

module.exports = router;