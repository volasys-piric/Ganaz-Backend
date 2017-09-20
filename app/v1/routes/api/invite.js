const express = require('express');
const router = express.Router();
const Promise = require('bluebird');
const twilioService = require('./../service/twilio.service');
const httpUtil = require('./../../../utils/http');
const log = require('./../../../utils/logger');
const db = require('./../../db');

const Invite = db.models.invite;
const Company = db.models.company;
const User = db.models.user;
const Myworker = db.models.myworker;

router.post('/', function (req, res) {
  /** Expected req.body
   {
       "company_id": "{company object id}",
       "phone_number": {
           "country": "US",
           "country_code": "1",
           "local_number": "{local phone number}"
       }
   }
   */
  const body = req.body;
  if (!body.company_id || !(body.phone_number && body.phone_number.local_number)) {
    res.json({
      success: false,
      msg: 'Request body company_id and phone_number.local_number are required.'
    })
  } else {
    /*
     https://bitbucket.org/volasys-ss/ganaz-backend/wiki/11.1%20Invite%20-%20New#markdown-header-change-log-v15
     CHANGE LOG: v1.5
     Backend will check if the phone number is already invited by the company. If not, it will do the followings.
     A. invite_only is not specified, or if it's false
     - Create Invite object if needed.
     - Create Onboarding worker object if needed. (Please refer to 1. User - Overview, Data Model)
     - Add onboarding-worker to my-workers list of the company if needed.
     - Regardless if invite was created or existing in DB, always Send SMS.
     B. invite_only = true
     - Create Invite object if needed
     - Regardless if invite was created or existing in DB, always Send SMS.
     */
    const inviteOnly = body.invite_only && typeof body.invite_only === 'boolean' ? body.invite_only : false;
    const companyId = body.company_id;
    const localNumber = body.phone_number.local_number;
    return Promise.join(
      Invite.findOne({company_id: companyId, 'phone_number.local_number': localNumber}),
      Company.findById(body.company_id)
    ).then(function (promiseResult) {
      let invite = promiseResult[0];
      const company = promiseResult[1];
      if (invite === null) {
        if (company === null) {
          return Promise.reject('Company with id ' + body.company_id + ' does not exists.');
        }
        // 1) Create Invite object if needed.
        invite = new Invite(req.body);
        return invite.save().then(function (invite) {
          log.info('[Invite] Created invite record with info: ' + JSON.stringify(invite) + '.');
          return {invite: invite, company: company, isNew: true};
        });
      } else {
        return {invite: invite, company: company, isNew: false};
      }
    }).then(function (result) {
      if (!inviteOnly) {
        // 2) Create Onboarding worker object if needed. (Please refer to 1. User - Overview, Data Model)
        return User.findOne({
          'company.company_id': companyId,
          'phone_number.local_number': localNumber
        }).then(function (user) {
          if (user === null) {
            const company = {company_id: companyId};
            const phoneNumber = {country: 'US', country_code: '1', local_number: localNumber};
            const basicUserInfo = {
              type: 'onboarding-worker',
              username: localNumber, // Since username is required and must be unique, so let's set this to localNumber
              company: company,
              phone_number: phoneNumber
            };
            const user = new User(basicUserInfo);
            return user.save().then(function (savedUser) {
              log.info('[Invite] Created onboarding user with info: ' + JSON.stringify(basicUserInfo) + '.');
              result.onboardingWorker = savedUser;
              return result;
            });
          } else if (user.type === 'onboarding-worker') {
            result.onboardingWorker = user;
            return result;
          } else {
            return result;
          }
        });
      } else {
        return result;
      }
    }).then(function (result) {
      if (!inviteOnly && result.onboardingWorker) {
        // 3) Add onboarding-worker to my-workers list of the company if needed.
        const userId = result.onboardingWorker._id.toString();
        return Myworker.findOne({
          company_id: companyId,
          worker_user_id: userId,
        }).then(function (myworker) {
          if (myworker === null) {
            myworker = new Myworker({company_id: companyId, worker_user_id: userId});
            return myworker.save().then(function (myworker) {
              return result;
            });
          } else {
            return result;
          }
        });
      } else {
        return result;
      }
    }).then(function (result) {
      const invite = result.invite;
      const company = result.company;
      const toFullNumber = "+" + invite.phone_number.country_code + invite.phone_number.local_number;
      const body = company.name.en + ' quisiera recomendar que ud baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download';
      twilioService.sendMessage(toFullNumber, body);
      return result;
    }).then(function (result) {
      const json = {success: true};
      if (result.isNew) {
        json.invite = result.invite;
      }
      res.json(json);
    }).catch(httpUtil.handleError(res));
  }
});

module.exports = router;