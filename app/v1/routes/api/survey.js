const express = require('express');
const router = express.Router();
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
const messageService = require('./../service/message.service');

const Survey = db.models.survey;

router.post('/', function (req, res) {
  /** Expected request body
   {
       "type": "choice-single/open-text",
       "owner": {
           "company_id": "{company object id, empty in case of worker}",
           "user_id": "{user object id}"
       },
       "question": {
           "en": "{english contents}",
           "es": "{spanish contents}"
       },
       "choices": [
           {
               "en": "{english contents}",
               "es": "{spanish contents}"
           },
           ...
       ],
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
       "metadata": {
           ....
       },
       "auto_translate": true/false
   }
   */
  const body = req.body;
  let errorMessage = _validate(body);
  if (errorMessage.length > 0) {
    res.json({success: false, msg: errorMessage});
  } else {
    const survey = new Survey(body);
    survey.save().then(function () {
      const message = {
        job_id: '',
        type: body.type,
        sender: {
          user_id: senderId,
          company_id: senderCompanyId
        },
        receivers: receivers,
        message: {
          'en': 'New job inquiry',
          'es': 'Nueva solicitud de empleo'
        },
        auto_translate: false,
        datetime: Date.now(),
        metadata: {
          application_id: application._id.toString()
        }
      };
    });
  }
});

function _validate(body) {
  let errorMessage = '';
  if (!body.type || body.type !== 'choice-single' || body.type !== 'open-text') {
    errorMessage += 'Request param type should be either choice-single/open-text.';
  }
  if (!body.question) {
    errorMessage += ' Either request param question.en or question.es should be set.';
  }
  const arrayNotSet = function (arr) {
    return !Array.isArray(arr) || arr.length < 1;
  };
  if (arrayNotSet(body.choices)) {
    errorMessage += ' Either request param choices array is required and format is ["en":"english contents", "es":"spanish contents"].';
  }
  if (arrayNotSet(body.receivers) || arrayNotSet(body.receivers_phone_numbers)) {
    errorMessage += ' Either request param receivers array or receivers_phone_numbers array should be set.';
  }
  return errorMessage;
}
module.exports = router;