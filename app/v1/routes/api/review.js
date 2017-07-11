const Promise = require('bluebird');
const express = require('express');
const router = express.Router();
const db = require('./../../db');
const httpUtil = require('./../../../utils/http');

const Review = db.models.review;
const Company = db.models.company;
const User = db.models.user;

router.post('/search', function (req, res) {
  /** Expected req.body
   {
       "company_id": "{company object id}",            [optional]
       "worker_user_id": "{worker user object id}",    [optional]
   }
   */
  const dbQ = {};
  if (req.body.company_id) {
    dbQ.company_id = req.body.company_id;
  }
  if (req.body.worker_user_id) {
    dbQ.worker_user_id = req.body.worker_user_id;
  }
  Review.find(dbQ).then(function (reviews) {
    res.json({
      success: true,
      reviews: reviews
    });
  }).catch(httpUtil.handleError(res));
});

router.post('/', function (req, res) {
  /** Expected req.body
   {
       "company_id": "{company object id}",
       "worker_user_id": "{worker user object id}",
       "comments": "comments",
       "rating": {
           "pay": 5,
           "benefits": 5,
           "supervisors": 5,
           "safety": 5,
           "trust": 5
       }
   }
   */
  const body = req.body;
  User.findById(body.worker_user_id).then(function (user) {
    if (!user) {
      return Promise.reject('User with id ' + body.worker_user_id + ' does not exists.');
    } else {
      return body;
    }
  }).then(function (body) {
    if (body.company_id) {
      return Company.findById(body.company_id).then(function (company) {
        if (company === null) {
          return Promise.reject('Company with id ' + body.company_id + ' does not exists.');
        } else {
          return body;
        }
      });
    } else {
      return body;
    }
  }).then(function (body) {
    const review = new Review(body);
    return review.save();
  }).then(function (review) {
    res.json({
      success: true,
      review: review
    });
  }).catch(httpUtil.handleError(res));
});

module.exports = router;