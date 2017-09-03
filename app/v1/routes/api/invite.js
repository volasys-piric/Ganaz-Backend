const express = require('express');
const router = express.Router();
const twilioService = require('./../service/twilio.service');
const httpUtil = require('./../../../utils/http');
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
    Company.findById(body.company_id).then(function (company) {
      if (company === null) {
        return Promise.reject('Company with id ' + body.company_id + ' does not exists.');
      } else {
        return company;
      }
    }).then(function (company) {
      const invite = new Invite(req.body);
      return invite.save().then(function (invite) {
        const toFullNumber = "+" + invite.phone_number.country_code + invite.phone_number.local_number;
        const body = company.name.en + ' quisiera recomendar que ud baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download';
        twilioService.sendMessage(toFullNumber, body);
        return invite;
      });
    }).then(function (invite) {
      res.json({
        success: true,
        invite: invite
      })
    }).catch(httpUtil.handleError(res));
  }
});

module.exports = router;