import express from 'express';
import jwt from 'jwt-simple';
import twilio from 'twilio';
const twilio_client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
import passport from 'passport';
import config from './../config/database';
import http from './../utils/http';
import Company from './../app/models/company';
import Invite from './../app/models/invite';

const router = express.Router();
router.route('/', passport.authenticate('jwt', {session: false}))
  .post(function (req, res) {
  let token = http.getToken(req.headers);
  if (token) {
    let decoded = jwt.decode(token, config.secret);
    let newInvite = new Invite(req.body);
    newInvite.save(function (err) {
      if (err) {
        return res.json({success: false, err: err});
      } else {
        res.json({success: true, invite: newInvite});
        // console.log("phone number: ", "+" + newInvite.phone_number.country_code + newInvite.phone_number.local_number);
        // console.log(`Hello, you are invited by ${decoded.company.name} to Ganaz Platform as a worker. You can search/apply for new job, and communicate with owners. (${config.appstore_url})`);

        Company.findById(newInvite.company_id, function (err, company) {
          if (err) {
            return console.error(err);
          }
          twilio_client.messages.create({
            from: config.TWILIO_PHONE_NUMBER,
            to: "+" + newInvite.phone_number.country_code + newInvite.phone_number.local_number,
            body: `${company.name} quisiera recomendar que ud baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download`
          }, function (err, message) {
            if (err) {
              console.error(err.message);
            } else {
              console.log(message);
            }
          });
        });
      }
    });
  } else {
    return res.status(403).send({success: false, msg: 'No token provided.'});
  }
});

export default router