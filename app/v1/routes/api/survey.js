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
    if (!body.owner.company_id) {
      body.owner.company_id = '';
    }
    const receivers = body.receivers;
    for (let i = 0; i < receivers.length; i++) {
      if (!receivers[i].company_id) {
        receivers[i].company_id = '';
      }
    }
    const survey = new Survey(body);
    survey.save().then(function (survey) {
      const messageParam = {
        job_id: '',
        type: 'survey-' + body.type,
        sender: body.owner,
        receivers: body.receivers,
        receivers_phone_numbers: body.receivers_phone_numbers,
        message: {
          en: survey.question ? survey.question.en : '',
          es: survey.question ? survey.question.es : ''
        },
        metadata: {
          survey: {survey_id: survey._id.toString()}
        },
        auto_translate: survey.auto_translate
      };
      messageService.create(messageParam, false).then(function () {
        res.json({success: true, survey: survey});
      });
    });
  }
});

function _validate(body) {
  let errorMessage = '';
  if (!body.type || (body.type !== 'choice-single' && body.type !== 'open-text')) {
    errorMessage += 'Request param type should be either choice-single/open-text.';
  }
  if (!body.question) {
    errorMessage += ' Either request param question.en or question.es should be set.';
  }
  if (!body.owner || !body.owner.user_id) {
    errorMessage += ' Request param owner.user_id is required.';
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