const Promise = require('bluebird');
const sendMail = require('sendmail');
const express = require('express');
const router = express.Router();
const appConfig = require('./../../../app_config');
const db = require('./../../db');
const logger = require('./../../../utils/logger');
const httpUtil = require('./../../../utils/http');

const Company = db.models.company;
const sendMailClient = sendMail();

router.post('/email', function (req, res) {
  /** Expected req.body
   {
       "subject": "{subject of message}",
       "message": "{contents of message}"
   }
   */
  const body = req.body;
  const user = req.user;

  const getCompanyPartOfMail = function () {
    if (user.type == 'company-regular' || user.type == 'company-admin') {
      return Company.findById(user.company.company_id).then(function (company) {
        return '<p>Company Name: ' + company.name.es + '</p>'
          + '<p>Company Code: ' + company.code + '</p>';
      });
    } else {
      return Promise.resolve('');
    }
  };
  getCompanyPartOfMail().then(function (companyPart) {
    const html = '<div>'
      + '<p>A user from Ganaz platform filed a ticket.</p>'
      + '<p>Name: ${decoded.firstname} ${decoded.lastname}</p>'
      + '<p>Email: ${decoded.email_address}</p>'
      + '<p>Login: ${decoded.username}</p>'
      + '<p>Type: ${decoded.type}</p>'
      + companyPart
      + '<p>Phone: ${decoded.phone_number.local_number}</p>'
      + '<p>===================</p>'
      + '<p>Subject: ${req.body.subject}</p>'
      + '<p>Message: ${req.body.message}</p>'
      + '<p>===================</p>'
      + '<p>Thank you.</p>'
      + '</div>';
    return new Promise(function (resolve, reject) {
      sendMailClient({
        from: user.email_address,
        to: appConfig.support_mail,
        subject: body.subject,
        html: html
      }, function (err, reply) {
        if (err) {
          logger.error(err);
          reject('Cannot send mail.');
        } else {
          logger.info(reply);
          resolve('Email sent to support team.');
        }
      });
    });
  }).then(function (msg) {
    res.json({
      success: true,
      msg: msg
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;