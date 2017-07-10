const express = require('express');
const router = express.Router();
const messageService = require('./../service/message.service');
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
       "type": "message/recruit/application",
       "sender": {
           "user_id": "{user object id}",
           "company_id": "{company object id, empty in case of worker}"
       },
       "receivers": [
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
       "message": {
           "en": "{Message in English}",
           "es": "{Message in Spanish}"
       },
       "auto_translate": true/false
   }
   */
  const body = req.body;
  messageService.create(body).then(function (messages) {
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
    messageService.updateStatus(req.params.id, body.status).then(function (message) {
      res.json({
        success: true,
        message: message
      });
    }).catch(httpUtil.handleError(res));
  }
});

module.exports = router;