const Promise = require('bluebird');
const messageService = require('./message.service');
const constants = require('./../../../utils/constants');
const db = require('./../../db');

const Recruit = db.models.recruit;
const User = db.models.user;
const Job = db.models.job;

const create = function (body) {
  const jobIdParam = body.job_ids;
  const broadcastRadiusParam = parseFloat(body.broadcast_radius);
  const reRecruitWorkerUserIdsParam = body.re_recruit_worker_user_ids;
  return Job.find({_id: {$in: jobIdParam}}).then(function (jobs) {
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
              "$maxDistance": constants.degreeInMiles * broadcastRadiusParam
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
    const now = Date.now();
    const createMessagePromises = [];
    for (let i = 0; i < newRecruits.length; i++) {
      const newRecruit = newRecruits[i];
      const recruitedWorkerUserIds = newRecruit.request.re_recruit_worker_user_ids;
      // Send Message and ignore if successful or not
      const receivers = recruitedWorkerUserIds.map(function (userId) {
        return {user_id: userId, company_id: ''};
      });
      const messageBody = {
        job_id: newRecruit.request.job_id,
        type: 'recruit',
        sender: {
          user_id: newRecruit.company_user_id,
          company_id: newRecruit.company_id
        },
        receivers: receivers,
        message: {
          en: 'New work available',
          es: 'Nuevo trabajo disponible'
        },
        auto_translate: true,
        datetime: now,
        metadata: {
          recruit_id: newRecruit._id.toString()
        }
      };
      createMessagePromises.push(messageService.create(messageBody));
    }
    return Promise.all(createMessagePromises).then(function () {
      return newRecruits;
    });
  });
};

const search = function (searchBody) {
  let query = {};
  if (searchBody.worker_user_id) {
    query.$or = [
      {recruited_worker_user_ids: searchBody.worker_user_id},
      {'request.re_recruit_worker_user_ids': searchBody.worker_user_id}
    ];
    query.recruited_worker_user_ids = searchBody.worker_user_id;
  }
  if (searchBody.company_id) {
    query.company_id = searchBody.company_id;
  }
  if (searchBody.job_id) {
    query["request.job_id"] = searchBody.job_id;
  }
  return Recruit.find(query);
};
module.exports = {
  create: create,
  search: search
};