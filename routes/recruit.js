import express from "express";
import Promise from "bluebird";
import request from "request";
import passport from "passport";
import config from "./../config/database";
import Job from "./../app/models/job";
import User from "./../app/models/user";
import Recruit from "./../app/models/recruit";

const router = express.Router();

router.route('/', passport.authenticate('jwt', {session: false}))
  .post(function (req, res) {
    const jobIdParam = req.body.job_ids;
    const broadcastRadiusParam = parseFloat(req.body.broadcast_radius);
    const reRecruitWorkerUserIdsParam = req.body.re_recruit_worker_user_ids;
    const constDegreeInMiles = 1.609 / 111.12; // 1 mile = 1.609km, One degree (earth) = 111.12 km
    Job.find({_id: {$in: jobIdParam}}).then(function (jobs) {
      const jobIdJobMap = new Map();
      for (let i = 0; i < jobs.length; i++) {
        const job = jobs[i];
        const jobId = job._id.toString();
        jobIdJobMap.set(jobId, job);
      }

      let jobIdRecruitedWorkerUserIdSetMapPromise = null;
      if (broadcastRadiusParam) {
        const jobIdLocationArr = [];
        for (let i = 0; i < jobs.length; i++) {
          const job = jobs[i];
          for (let j = 0; j < job.locations.length; j++) {
            jobIdLocationArr.push({jobId: job._id.toString(), location: job.locations[j]})
          }
        }
        let findUserPromises = [];
        for (let i = 0; i < jobIdLocationArr.length; i++) {
          findUserPromises.push(
            User.find({
              "worker.location.loc": {
                "$near": jobIdLocationArr[i].location.loc,
                "$maxDistance": constDegreeInMiles * broadcastRadiusParam
              }
            }, '_id')
          )
        }

        jobIdRecruitedWorkerUserIdSetMapPromise = Promise.all(findUserPromises).then(function (findUserPromiseResult) {
          const jobIdRecruitedWorkerUserIdSetMap = new Map();
          for (let i = 0; i < findUserPromiseResult.length; i++) {
            const jobId = jobIdLocationArr[i].jobId;
            let recruitedWorkerUserIdSet = jobIdRecruitedWorkerUserIdSetMap.get(jobId);
            if (!recruitedWorkerUserIdSet) {
              recruitedWorkerUserIdSet = new Set();
              jobIdRecruitedWorkerUserIdSetMap.set(jobId, recruitedWorkerUserIdSet);
            }
            const userModels = findUserPromiseResult[i];
            for (let i = 0; i < userModels.length; i++) {
              const userId = userModels[i]._id.toString();
              recruitedWorkerUserIdSet.add(userId);
            }
          }
          return jobIdRecruitedWorkerUserIdSetMap;
        });
      } else {
        jobIdRecruitedWorkerUserIdSetMapPromise = User.find({type: 'worker'}, '_id').then(function (userModels) {
          const recruitedWorkerUserIdSet = new Set();
          for (let i = 0; i < userModels.length; i++) {
            const userId = userModels[i]._id.toString();
            recruitedWorkerUserIdSet.add(userId);
          }
          const jobIdRecruitedWorkerUserIdSetMap = new Map();
          for (let i = 0; i < jobs.length; i++) {
            const job = jobs[i];
            jobIdRecruitedWorkerUserIdSetMap.set(job._id.toString(), recruitedWorkerUserIdSet);
          }
          return jobIdRecruitedWorkerUserIdSetMap;
        });
      }

      return jobIdRecruitedWorkerUserIdSetMapPromise.then(function (jobIdRecruitedWorkerUserIdSetMap) {
        const newRecruitsPromises = [];
        for (const entry of jobIdRecruitedWorkerUserIdSetMap) {
          const jobId = entry[0];
          const recruitedWorkerUserIdSet = entry[1];
          const job = jobIdJobMap.get(jobId);
          const companyId = job.company_id;
          const companyUserId = job.company_user_id;
          const newRecruit = new Recruit({
            company_id: companyId,
            company_user_id: companyUserId,
            request: {
              job_id: jobId,
              re_recruit_worker_user_ids: [...recruitedWorkerUserIdSet]
            },
            recruited_worker_user_ids: reRecruitWorkerUserIdsParam
          });
          if (broadcastRadiusParam) {
            newRecruit.request.broadcast_radius = broadcastRadiusParam;
          }
          newRecruitsPromises.push(newRecruit.save().then(function (model) {
            return model;
          }));
        }
        return Promise.all(newRecruitsPromises);
      });
    }).then(function (newRecruits) {
      res.json({success: true, recruits: newRecruits});

      for (let i = 0; i < newRecruits.length; i++) {
        const newRecruit = newRecruits[i];
        const companyId = newRecruit.company_id;
        const companyUserId = newRecruit.company_user_id;
        const recruitedWorkerUserIds = newRecruit.request.re_recruit_worker_user_ids;
        const jobId = newRecruit.request.job_id;
        // Send Message and ignore if successful or not
        const receivers = recruitedWorkerUserIds.map(function (userId) {
          return {'user_id': userId, 'company_id': ''};
        });
        const request_body = JSON.stringify({
          'job_id': jobId,
          'type': 'recruit',
          'sender': {
            'user_id': companyUserId,
            'company_id': companyId
          },
          'receivers': receivers,
          "message": {
            "en": "New work available",
            "es": "Nuevo trabajo disponible"
          },
          'auto_tranlate': "true",
          'datetime': new Date()
        });
        const headers = {
          'Content-Length': Buffer.byteLength(request_body),
          'authorization': req.headers.authorization,
          'content-type': 'application/json'
        };
        request.post({
          url: config.site_url + '/message',
          headers: headers,
          body: request_body
        }, function (error, response, body) {
          if (!error) {
            console.log(body);
          } else {
            console.error('Error:', error);
          }
        });
      }
    }).catch(function (error) {
      console.log(error);
      res.json({
        success: false, message: "Failed to recruit users. Reason: " + error.message
      })
    });
  });

router.route('/search', passport.authenticate('jwt', {session: false}))
  .post(function (req, res) {
    let query = {};
    if (req.body.worker_user_id) {
      query.recruited_worker_user_ids = req.body.worker_user_id;
    }
    if (req.body.company_id) {
      query.company_id = req.body.company_id;
    }
    if (req.body.job_id) {
      query["request.job_id"] = req.body.job_id;
    }
    Recruit.find(query).then(function (recruits) {
      res.json({
        success: true,
        recruits: recruits
      })
    }).catch(function (error) {
      console.error('Error:', error);
      res.json({
        success: false,
        recruits: []
      })
    });
  });

export default router