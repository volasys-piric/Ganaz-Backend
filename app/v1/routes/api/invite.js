const express = require('express');
const router = express.Router();
const twilioService = require('./../service/twilio.service');
const httpUtil = require('./../../../utils/http');
const db = require('./../../db');

const Invite = db.models.invite;
const Company = db.models.company;

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
  Company.findById(body.company_id).then(function (company) {
    if (company === null) {
      return Promise.reject('Company with id ' + body.company_id + ' does not exists.');
    } else {
      return company;
    }
  }).then(function (company) {
    const invite = new Invite(req.body);
    return invite.save().then(function (invite) {
      const toFullNumber = "+" + newInvite.phone_number.country_code + newInvite.phone_number.local_number;
      const body = company.name + ' quisiera recomendar que ud baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download';
      return twilioService.sendMessage(toFullNumber, body).then(function () {
        return invite;
      });
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;