const express = require('express');
const router = express.Router();
const recruitService = require('./../service/recruit.service');
const httpUtil = require('./../../../utils/http');

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/9.1%20Recruit%20-%20New
router.post('/', function (req, res) {
  /** Expected request body
   {
       "job_ids": [
           "{job id}",
           "{job id}",
           ...
       ],
       "broadcast_radius": "{miles}",                [optional]
       "re_recruit_worker_user_ids": [               [optional]
           "{worker user id}",
           "{worker user id}",
           ...
       ]
   }
   */
  const body = req.body;
  recruitService.create(body, req.user).then(function (newRecruits) {
    res.json({success: true, recruits: newRecruits});
  }).catch(httpUtil.handleError(res));
});

router.post('/search', function (req, res) {
  recruitService.search(req.body).then(function (recruits) {
    res.json({
      success: true,
      recruits: recruits
    })
  }).catch(httpUtil.handleError(res));
});

module.exports = router;