const express = require('express');
const router = express.Router();

const httpUtil = require('./../../../utils/http');
const twiliophoneService = require('./../service/twiliophone.service');

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/19.3%20Twilio%20Phones%20-%20Create
router.post('/', function (req, res) {
  /** Expected req.body is
   {
       "is_default": true/false,
       "phone_number": {
           "country": "US",
           "country_code": "1",
           "local_number": "{local number}"
       },
       "company_ids": [
           "{company object id}",
           "{company object id}",
           ...
       ],
   }
   */
  const body = req.body;
  if (!body) {
    res.json({success: false, msg: 'Request body not found.'});
  } else {
    return twiliophoneService.create(body).then(function (twiliophone) {
      res.json({
        success: true,
        twilio_phone: twiliophone
      });
    }).catch(httpUtil.handleError(res));
  }
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/19.4%20Twilio%20Phones%20-%20Update
router.patch('/:id', function (req, res) {
  /**
   {
       "is_default": true/false,                   [optional],
       "phone_number": {                           [optional],
           "country": "US",
           "country_code": "1",
           "local_number": "{local number}"
       },
       "company_ids": [                            [optional],
           "{company object id}",
           "{company object id}",
           ...
       ],
   }
   */
  const body = req.body;
  if (!body) {
    res.json({success: false, msg: 'Request body not found.'});
  } else {
    twiliophoneService.update(req.params.id, body).then(function (twiliophone) {
      res.json({
        success: true,
        twilio_phone: twiliophone
      });
    }).catch(httpUtil.handleError(res));
  }
});

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

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/19.2%20Twilio%20Phones%20-%20Get%20Details%20By%20Id
router.get('/:id', function (req, res) {
  twiliophoneService.findById(req.params.id).then(function (twiliophone) {
    res.json({
      success: true,
      twilio_phone: twiliophone
    });
  }).catch(httpUtil.handleError(res));
});