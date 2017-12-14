const express = require('express');
const router = express.Router();

const httpUtil = require('./../../../utils/http');
const twiliophoneService = require('./../service/twilio.service');

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/19.1%20Twilio%20Phone%20-%20Search
router.post('/search', function (req, res) {
  /** Expected req.body is
   {
       "company_id": "{company object id}",                [optional],
       "is_default": true/false                            [optional],
   }
   */
  const body = req.body;
  twiliophoneService.search(body).then(function (twiliophones) {
    res.json({
      success: true,
      twilio_phones: twiliophones
    });
  }).catch(httpUtil.handleError(res));
});