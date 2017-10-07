const express = require('express');
const router = express.Router();
const Promise = require('bluebird');
const mongoose = require('mongoose');
const db = require('./../../db');
const logger = require('./../../../utils/logger');
const httpUtil = require('./../../../utils/http');
const pushNotification = require('./../../../push_notification');

const Survey = db.models.survey;
const Answer = db.models.answer;
const User = db.models.user;
const Company = db.models.company;
const Message = db.models.message;

router.post('/', function (req, res) {
  /** Expected request body
   {
       "survey_id": "{survey id}",
       "answer": {
           "index": "",                           [optional]
           "text": {                              [optional]
               "en": "{english text}",
               "es": "{spanish text}"
           }
       },
       "responder": {
           "user_id": "{user object id}",
           "company_id": "{company object id, empty in case of worker}"
       },
       "metadata": {                              [optional]
           ... free-form json data ...
       },
       "auto_translate": true/false,
   }
   */
  const body = req.body;
  _validate(body).then(function (models) {
    const survey = models.survey;
    const user = models.user;
    body.survey = {owner: {company_id: survey.owner.company_id}};
    if (!body.responder.company_id) {
      body.responder.company_id = '';
    }
    const answer = new Answer(body);
    return answer.save().then(function (answer) {
      const message = new Message({
        job_id: 'NONE',
        type: 'survey-answer',
        sender: answer.responder,
        receiver: {
          user_id: survey.owner.user_id.toString(),
          company_id: survey.owner.company_id
        },
        message: {
          en: 'Your survey is answered',
          es: 'Your survey is answered'
        },
        metadata: {
          survey: {
            survey_id: survey._id.toString(),
            answer_id: answer._id.toString()
          }
        },
        auto_translate: answer.auto_translate
      });
      return message.save().then(function () {
        if (user.player_ids) {
          pushNotification.sendMessage(user.player_ids, message);
        } else {
          logger.warn('[Answer API] Not sending push notification. User with id ' + user._id.toString() + ' has no player_ids.');
        }
        res.json({success: true, answer: answer});
      });
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/search', function (req, res) {
  /** Expected request body
   {
       "survey_id": "{survey id}",                           [optional]
       "answer_id": "{answer id}",                           [optional]
       "owner": {                                            [optional]
           "company_id": "{company object id of owner}"
       },
       "responder": {                                        [optional]
           "user_id": "{company object id of responder, typically worker}"
       },
   }
   */
  const body = req.body;
  const dbQ = {};
  if (body.survey_id) {
    dbQ.survey_id = body.survey_id;
  }
  if (body.answer_id) {
    dbQ._id = mongoose.Types.ObjectId(body.answer_id);
  }
  if (body.owner && body.owner.company_id) {
    dbQ['survey.owner.company_id'] = body.owner.company_id;
  }
  if (body.responder && body.responder.user_id) {
    dbQ['responder.user_id'] = mongoose.Types.ObjectId(body.responder.user_id);
  }
  Answer.find(dbQ).then(function (answers) {
    res.json({
      success: true,
      answers: answers
    });
  }).catch(httpUtil.handleError(res));
});

function _validate(body) {
  let errorMessage = '';
  if (!body.survey_id) {
    errorMessage += 'Request param survey_id should be set.';
  }
  if (!body.responder || !body.responder.user_id) {
    errorMessage += ' Request param responder.user_id should be set.';
  }
  if (errorMessage.length > 0) {
    return Promise.reject(errorMessage);
  } else {
    const findCompanyPromise = body.responder.company_id ? Company.findById(body.responder.company_id) : Promise.resolve(null);
    return Promise.join(
      Survey.findById(body.survey_id),
      User.findById(body.responder.user_id),
      findCompanyPromise
    ).then(function (promiseResult) {
      let errorMessage = '';
      const survey = promiseResult[0];
      const user = promiseResult[1];
      const company = promiseResult[2];
      if (!survey) {
        errorMessage += ' Survey with id ' + body.survey_id + ' does not exists.';
      }
      if (!user) {
        errorMessage += ' Responder with id ' + body.responder.user_id + ' does not exists.';
      }
      if (body.responder.company_id && !company) {
        errorMessage += ' Responder company with id ' + body.responder.company_id + ' does not exists.';
      }
      if (errorMessage) {
        return Promise.reject(errorMessage);
      } else {
        return Promise.resolve({
          survey: survey,
          user: user,
          company: company
        })
      }
    });
  }
}
module.exports = router;