const Promise = require('bluebird');
const pushNotification = require('./../../../push_notification');
const logger = require('./../../../utils/logger');
const db = require('./../../db');

const User = db.models.user;
const Company = db.models.company;
const Message = db.models.message;
const Survey = db.models.survey;
const Answer = db.models.answer;

const _validate = (body) => {
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
    ).then(function(promiseResult) {
      let errorMessage = '';
      const survey = promiseResult[0];
      const user = promiseResult[1];
      const company = promiseResult[2];
      if (!survey) {
        errorMessage += ` Survey with id ${body.survey_id} does not exists.`;
      }
      if (!user) {
        errorMessage += ` Responder with id ${body.responder.user_id} does not exists.`;
      }
      if (body.responder.company_id && !company) {
        errorMessage += ` Responder company with id ${body.responder.company_id} does not exists.`;
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
};

const _createAnswer = (body, survey, responderUser, datetime) => {
  logger.warn(`[Answer Service] Creating user ${responderUser._id.toString()} answer record.`);
  if (!datetime) {
    datetime = Date.now();
  }
  body.survey_id = survey._id;
  body.survey = {owner: {company_id: survey.owner.company_id}};
  if (!body.responder.company_id) {
    body.responder.company_id = '';
  }
  body.datetime = datetime;
  const answer = new Answer(body);
  return answer.save().then(function(answer) {
    
    const message = new Message({
      job_id: 'NONE',
      type: 'survey-answer',
      sender: answer.responder,
      receivers: [{
        user_id: survey.owner.user_id.toString(),
        company_id: survey.owner.company_id,
        status: 'new'
      }],
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
      auto_translate: answer.auto_translate,
      datetime: datetime
    });
    return message.save().then(function() {
      if (responderUser.player_ids) {
        pushNotification.sendMessage(responderUser.player_ids, message);
      } else {
        logger.warn(`[Answer Service] Not sending push notification. User with id ${responderUser._id.toString()} has no player_ids.`);
      }
      return answer;
    });
  });
};

module.exports = {
  validateAndCreateAnswer: (body) => {
    return _validate(body).then((models) => {
      const survey = models.survey;
      const user = models.user;
      return _createAnswer(body, survey, user);
    })
  },
  createAnswer: (body, survey, responderUser, datetime) => {
    return _createAnswer(body, survey, responderUser, datetime);
  },
};