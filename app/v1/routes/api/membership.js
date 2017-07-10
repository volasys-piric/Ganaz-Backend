const express = require('express');
const router = express.Router();
const db = require('./../../db');
const httpUtil = require('./../../../utils/http');

const Membership = db.models.membership;

router.get('/', function (req, res) {
  Membership.find().then(function (plans) {
    res.json({
      success: true,
      plans: plans
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;