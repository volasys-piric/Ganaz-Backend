const express = require('express');
const router = express.Router();
const Promise = require('bluebird');
const mongoose = require('mongoose');
const twilioService = require('./../service/twilio.service');
const httpUtil = require('./../../../utils/http');
const log = require('./../../../utils/logger');
const db = require('./../../db');

const Smslog = db.models.smslog;
const Invite = db.models.invite;
const User = db.models.user;
const Myworker = db.models.myworker;

router.post('/error/:errorCode/resend', function (req, res) {
  const body = req.body;
  const errorCode = req.params.errorCode;
  Smslog.find({'twilio.exception.code': parseInt(errorCode)}, null, {sort: {datetime: -1}}).then(function (smsLogs) {
    const promises = [];
    for (let i = 0; i < smsLogs.length; i++) {
      promises.push(Invite.find({'phone_number.local_number': smsLogs[i].receiver.phone_number.local_number}));
    }
    return Promise.all(promises).then(function (promiseResults) {
      const validSmsLogs = [];
      const localNumbers = [];
      const messageBody = "Taylor Farms quisiera recomendar que ud baje la aplicaci�n Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download";
      for (let i = 0; i < promiseResults.length; i++) {
        const smsLog = smsLogs[i];
        const localNumber = smsLog.receiver.phone_number.local_number;
        if (localNumbers.indexOf(localNumber) !== -1) {
          log.warn('Duplicate local number ' + localNumber + ' found.');
        } else {
          localNumbers.push(localNumber);
          const invites = promiseResults[i];
          if (invites.length > 1) {
            log.warn('Invite records of ' + smsLog.receiver.phone_number.local_number + ' is ' + invites.length);
          } else if (invites.length === 0) {
            log.warn('Invite records of ' + smsLog.receiver.phone_number.local_number + ' is 0');
          } else {
            if (!smsLog.message || !smsLog.sender.user_id) {
              if (!smsLog.message) {
                smsLog.message = messageBody;
              }
              if (!smsLog.sender.user_id) {
                smsLog.sender.user_id = mongoose.Types.ObjectId('59dcfe0df2289d0d39bec3e6');
              }
              validSmsLogs.push(smsLog.save());
            } else {
              validSmsLogs.push(Promise.resolve(smsLog));
            }
          }
        }
      }
      return Promise.all(validSmsLogs);
    }).then(function (validSmsLogs) {
      let sendSms = true;
      if (body.send_sms !== 'undefined') {
        if (typeof body.send_sms === 'boolean') {
          sendSms = body.send_sms;
        } else if (body.send_sms === 'false') {
          sendSms = false;
        }
      }
      if (sendSms) {
        // Send asynchronously
        const promises = [];
        for (let i = 0; i < validSmsLogs.length; i++) {
          promises.push(User.find({'phone_number.local_number': validSmsLogs[i].receiver.phone_number.local_number}));
        }
        return Promise.all(promises).then(function (users) {
          const promises = [];
          for (let i = 0; i < users.length; i++) {
            const companyId = validSmsLogs[i].sender.company_id;
            const user = users[i];
            if (user && companyId) {
              promises.push(Myworker.find({worker_user_id: user._id.toString(), company_id: companyId}));
            } else {
              promises.push(Promise.resolve(null));
            }
          }
        }).then(function (myworkers) {
          for (let i = 0; i < myworkers.length; i++) {
            const myworkerId = myworkers[i] ? myworkers[i]._id.toString() : null;
            twilioService.sendMessage(validSmsLogs[i], myworkerId);
          }
        });
      }
      res.json({
        count: validSmsLogs.length,
        resent_ids: validSmsLogs.map(function (m) {
          return {
            id: m._id.toString(),
            sender_company_id: m.sender.company_id,
            sender_user_id: m.sender.user_id,
            receiver: m.receiver.phone_number.local_number,
            message: m.message,
          }
        })
      });
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;