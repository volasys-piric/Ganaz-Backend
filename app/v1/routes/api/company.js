const express = require('express');
const router = express.Router();

const httpUtil = require('./../../../utils/http');
const companyService = require('./../service/company.service');
const paymentMethodService = require('./../service/paymentMethod.service');
const crewService = require('./../service/crew.service');
const myworkerService = require('./../service/myworker.service');

//https://bitbucket.org/volasys-ss/ganaz-backend/wiki/2.1%20Company%20-%20Create
router.post('/', function (req, res) {
  /** Expected req.body is
   {
       "name": {
           "en": "{Company Name in English}",
           "es": "{Company Name in Spanish}"
       },
       "description": {
           "en": "{Company Description in English}",
           "es": "{Company Description in Spanish}"
       },
       "auto_translate": true/false,
       "code": "{unique company code}",
       "address": {
           "address1": "{address 1}",
           "address2": "{apt / street no}",
           "city": "{city}",
           "state": "{state}",
           "country": "{country}"
       },
       "plan": {
           "type": "free/premium",
           "title": "{Title of Plan}",
           "fee": {fee},
           "jobs": {number of job postings},
           "recruits": {number of recruits},
           "messages": {number of messages},
           "start_date": "yyyy-MM-dd HH:mm:ss.ZZZZ",
           "end_date": "yyyy-MM-dd HH:mm:ss.ZZZZ",
           "auto_renewal": true/false
       }
   }
   */
  const body = req.body;
  if (!body) {
    res.json({success: false, msg: 'Request body not found.'});
  } else {
    companyService.create(body).then(function (company) {
      res.json({
        success: true,
        company: company
      });
    }).catch(httpUtil.handleError(res));
  }
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/2.2%20Company%20-%20Get%20Details%20By%20Id
router.get('/:id', function (req, res) {
  companyService.getCompany(req.params.id, true).then(function (company) {
    res.json({
      success: true,
      company: company
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/2.3%20Company%20-%20Search
router.post('/search', function (req, res) {
  /** Expected req.body
   {
       "code": "{company code}"
   }
   */
  companyService.findByCode(req.body.code).then(function (companies) {
    res.json({
      success: true,
      companies: companies
    });
  }).catch(httpUtil.handleError(res));
});

https://bitbucket.org/volasys-ss/ganaz-backend/wiki/2.4%20Company%20-%20Update
router.patch('/:id/profile', function (req, res) {
  /** Expected req.body
   {
       "name": {                                                    [optional],
           "en": "{Company Name in English}",
           "es": "{Company Name in Spanish}"
       },
       "description": {                                             [optional],
           "en": "{Company Description in English}",
           "es": "{Company Description in Spanish}"
       },
       "auto_translate": true/false,                                [optional],
       "code": "{unique company code}",                             [optional],
       "address": {                                                 [optional],
           "address1": "{address 1}",
           "address2": "{apt / street no}",
           "city": "{city}",
           "state": "{state}",
           "country": "{country}"
       }
   }
   */
  companyService.update(req.params.id, req.body).then(function (company) {
    res.json({
      success: true,
      company: company
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/2.5%20Company%20-%20Update%20Membership%20Plan
router.patch('/:id/plan', function (req, res) {
  /** Expected req.body
   {
       "plan": {
           "type": "free/premium",                                 [optional]
           "title": "{Title of Plan}",                             [optional]
           "fee": {fee},                                           [optional]
           "jobs": {number of job postings},                       [optional]
           "recruits": {number of recruits},                       [optional]
           "messages": {number of messages},                       [optional]
           "start_date": "yyyy-MM-dd HH:mm:ss.ZZZZ",               [optional]
           "end_date": "yyyy-MM-dd HH:mm:ss.ZZZZ",                 [optional]
           "auto_renewal": true/false                              [optional]
       }
   }
   */
  companyService.updatePlan(req.params.id, req.body.plan).then(function (company) {
    res.json({
      success: true,
      company: company
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/3.1%20Company%20%3E%20Payment%20Method%20-%20Add%20Card
router.post('/:id/payment_methods', function (req, res) {
  /** Expected req.body
   {
       "type": "cc",
       "gateway": "stripe",
       "stripe_token": "{Stripe Token}",
       "billing_address": {
           "name": "{name}",
           "address1": "{address 1}",
           "address2": "{apt / street no}",
           "city": "{city}",
           "state": "{state}",
           "country": "{country}"
       }
   }
   */
  paymentMethodService.addPaymentMethodToCompany(req.params.id, req.body).then(function (paymentMethod) {
    res.json({
      success: true,
      payment_method: paymentMethod
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/3.2%20Company%20%3E%20Payment%20Method%20-%20Delete
router.delete('/:id/payment_methods/:paymentMethodId', function (req, res) {
  paymentMethodService.deleteById(req.params.paymentMethodId).then(function (paymentMethod) {
    res.json({
      success: true,
      payment_methods: [paymentMethod]
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/3.3%20Company%20%3E%20Payment%20-%20Pay%20With%20Stripe
router.post('/:id/pay', function (req, res) {
  /** Expected req.body
   {
       "payment_method_id": "{payment method id}",
       "amount": {Amount in USD},
       "currency": "USD"
   }
   */
  const body = req.body;
  paymentMethodService.pay(body.payment_method_id, body.amount, body.currency, req.user.email_address)
    .then(function (paymentHistory) {
      res.json({
        success: paymentHistory.success,
        payment_history: paymentHistory
      });
    }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/4.1%20Company%20%3E%20Crew%20-%20Get%20List
router.get('/:id/crews', function (req, res) {
  crewService.findByCompanyId(req.params.id).then(function (crews) {
    res.json({
      success: true,
      crews: crews
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/4.2%20Company%20%3E%20Crews%20-%20Add
router.post('/:id/crews', function (req, res) {
  crewService.create(req.params.id, req.body.title).then(function (crew) {
    res.json({
      success: true,
      crew: crew
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/4.3%20Company%20%3E%20Crews%20-%20Update
router.patch('/:id/crews/:crewId', function (req, res) {
  crewService.update(req.params.crewId, req.body.title).then(function (crew) {
    res.json({
      success: true,
      crew: crew
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/4.4%20Company%20%3E%20Crews%20-%20Delete
router.delete('/:id/crews/:crewId', function (req, res) {
  crewService.deleteById(req.params.crewId).then(function (crew) {
    res.json({
      success: true,
      crew: crew
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/5.1%20Company%20%3E%20My%20Worker%20-%20Get%20List
router.get('/:id/my-workers', function (req, res) {
  myworkerService.findByCompanyId(req.params.id).then(function (myworkers) {
    res.json({
      success: true,
      my_workers: myworkers
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/5.1%20Company%20%3E%20My%20Worker%20-%20Get%20List
router.post('/:id/my-workers', function (req, res) {
  /** Expected Request body
   {
       "worker_user_ids": [
           {worker user id},
           {worker user id},
           ...
       ],
       "crew_id": "{crew object id}"
   }
   */
  myworkerService.create(req.params.id, req.body).then(function (myworkers) {
    res.json({
      success: true,
      added_workers: myworkers
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/5.3%20Company%20%3E%20My%20Worker%20-%20Delete
router.delete('/:id/my-workers/:myworkerId', function (req, res) {
  myworkerService.deleteById(req.params.myworkerId).then(function (myworker) {
    res.json({
      success: true,
      my_worker: myworker
    });
  }).catch(httpUtil.handleError(res));
});

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/5.4%20Company%20%3E%20My%20Worker%20-%20Update%20Nickname
router.patch('/:id/my-workers/:myworkerId', function (req, res) {
  /** Expected req.body
   {
       "nickname": "{nickname}",             [optional]
       "crew_id": "{crew id}",               [optional]
       "twilio_phone_id": "{twilio phone id} [optional]
   }
   */
  const body = req.body;
  myworkerService.update(req.params.myworkerId, body).then(function (myworker) {
    res.json({
      success: true,
      my_worker: myworker
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;