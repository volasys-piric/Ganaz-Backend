const Promise = require('bluebird');
const mongoose = require('mongoose');
const messageService = require('./message.service');
const twilioService = require('./twilio.service');
const constants = require('./../../../utils/constants');
const db = require('./../../db');

const Recruit = db.models.recruit;
const User = db.models.user;
const Job = db.models.job;
const MyWorker = db.models.myworker;
const Company = db.models.company;

const isNotNullOrEmpty = function (arr) {
  return arr && arr.length > 0;
};

const create = function (body, currentUser) {
  const jobIdParam = body.job_ids;
  const broadcastRadiusParam = parseFloat(body.broadcast_radius);
  const reRecruitWorkerUserIdsParam = body.re_recruit_worker_user_ids;
  const phoneNumbersParam = body.phone_numbers;
  const registeredUserPhoneNumbers = new Map();
  const addNumberToRegistedUsersPhoneNumber = function (user) {
    if (user.phone_number && user.phone_number.local_number) {
      registeredUserPhoneNumbers.set(user.phone_number.local_number, user)
    }
  };

  return Job.find({_id: {$in: jobIdParam}}).then(function (jobs) {
    const jobIdJobMap = new Map();
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const jobId = job._id.toString();
      jobIdJobMap.set(jobId, job);
    }
    const jobIdLocationArr = [];
    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      for (let j = 0; j < job.locations.length; j++) {
        jobIdLocationArr.push({jobId: job._id.toString(), location: job.locations[j]})
      }
    }
    const broadcastConditionsPromise = (function () {
      if (broadcastRadiusParam) {
        return MyWorker.find({company_id: currentUser.company.company_id}).then(function (myWorkers) {
          const conditions = [];
          const aYearAgo = new Date();
          aYearAgo.setFullYear(aYearAgo.getFullYear() - 1);
          for (let i = 0; i < jobIdLocationArr.length; i++) {
            const condition = {
              "worker.location.loc": {
                "$near": jobIdLocationArr[i].location.loc,
                "$maxDistance": constants.degreeInMiles * broadcastRadiusParam
              },
              $or: [
                {"worker.is_newjob_lock": false},
                {created_at: {$lt: aYearAgo}}
              ],
            };
            if (myWorkers.length > 0) {
              const workerIds = [];
              for (let i = 0; i < myWorkers.length; i++) {
                workerIds.push(mongoose.Types.ObjectId(myWorkers[i].worker_user_id));
              }
              condition.$or.push({_id: {$in: workerIds}});
            }
            conditions.push(condition);
          }
          return conditions;
        })
      } else {
        return Promise.resolve([]);
      }
    })();
    const reRecruitedWorkerUserIdsConditionsPromise = (function () {
      let condition = null;
      const toObjectIds = function (ids) {
        const result = [];
        for (let i = 0; i < ids.length; i++) {
          result.push(mongoose.Types.ObjectId(ids[i]));
        }
        return result;
      };
      if (isNotNullOrEmpty(reRecruitWorkerUserIdsParam) && isNotNullOrEmpty(phoneNumbersParam)) {
        condition = {
          $or: [
            {_id: {$in: toObjectIds(reRecruitWorkerUserIdsParam)}},
            {'phone_number.local_number': {$in: phoneNumbersParam}}
          ]
        }
      } else if (isNotNullOrEmpty(reRecruitWorkerUserIdsParam)) {
        condition = {_id: {$in: toObjectIds(reRecruitWorkerUserIdsParam)}}
      } else if (isNotNullOrEmpty(phoneNumbersParam)) {
        condition = {'phone_number.local_number': {$in: phoneNumbersParam}}
      }
      return Promise.resolve(condition);
    })();

    return Promise.all([broadcastConditionsPromise, reRecruitedWorkerUserIdsConditionsPromise])
      .then(function (conditions) {
        const broadCastRadiusCondition = conditions[0];
        const reRecruitedWorkerUserIdsConditions = conditions[1];

        if (broadCastRadiusCondition.length > 0) {
          const findUsersPromises = [];
          for (let i = 0; i < broadCastRadiusCondition.length; i++) {
            findUsersPromises.push(User.find(broadCastRadiusCondition[i]));
          }
          if (reRecruitedWorkerUserIdsConditions) {
            findUsersPromises.push(User.find(reRecruitedWorkerUserIdsConditions));
          }
          return Promise.all(findUsersPromises).then(function (findUsersResult) {
            const saveRecruitPromises = [];
            // Group users by job to avoid multiple Recruit records in the same job
            const jobIdUsersMap = new Map();
            for (let i = 0; i < broadCastRadiusCondition.length; i++) {
              const users = findUsersResult[i];
              if (users.length > 0) {
                const jobIdLocation = jobIdLocationArr[i];
                let userIdUserMap = jobIdUsersMap.get(jobIdLocation.jobId);
                if (userIdUserMap === null || userIdUserMap === undefined) {
                  userIdUserMap = new Map();
                  jobIdUsersMap.set(jobIdLocation.jobId, userIdUserMap);
                }
                for (let j = 0; j < users.length; j++) {
                  const user = users[j];
                  const id = user._id.toString();
                  if (!userIdUserMap.has(id)) {
                    userIdUserMap.set(id, user);
                    addNumberToRegistedUsersPhoneNumber(user);
                  }
                }
              }
            }
            const reRecruitedWorkerUserIds = [];
            if (reRecruitedWorkerUserIdsConditions) {
              const recruitedWorkerUsers = findUsersResult[findUsersResult.length - 1];
              for (let i = 0; i < recruitedWorkerUsers.length; i++) {
                const user = recruitedWorkerUsers[i];
                reRecruitedWorkerUserIds.push(user._id.toString());
                addNumberToRegistedUsersPhoneNumber(user);
              }
            }
            for (let i = 0; i < jobs.length; i++) {
              const job = jobs[i];
              const jobId = job._id.toString();
              const userIdUserMap = jobIdUsersMap.get(jobId);
              const recruit = new Recruit({
                company_id: currentUser.company.company_id,
                company_user_id: currentUser.id,
                request: {
                  job_id: jobId,
                  broadcast_radius: broadcastRadiusParam,
                  re_recruit_worker_user_ids: reRecruitedWorkerUserIds
                }
              });
              if (userIdUserMap) {
                const recruitedWorkerUserIdSet = [];
                for (let userId of userIdUserMap.keys()) {
                  recruitedWorkerUserIdSet.push(userId);
                }
                recruit.recruited_worker_user_ids = recruitedWorkerUserIdSet;
              }
              saveRecruitPromises.push(recruit.save());
            }
            return Promise.all(saveRecruitPromises);
          });
        } else if (reRecruitedWorkerUserIdsConditions) {
          return User.find(reRecruitedWorkerUserIdsConditions).then(function (users) {
            const saveRecruitPromises = [];
            const reRecruitedWorkerUserIds = [];
            for (let i = 0; i < users.length; i++) {
              const user = users[i];
              reRecruitedWorkerUserIds.push(user._id.toString());
              addNumberToRegistedUsersPhoneNumber(user);
            }
            for (let i = 0; i < jobs.length; i++) {
              const job = jobs[i];
              const jobId = job._id.toString();
              const recruit = new Recruit({
                company_id: currentUser.company.company_id,
                company_user_id: currentUser.id,
                request: {
                  job_id: jobId,
                  re_recruit_worker_user_ids: reRecruitedWorkerUserIds
                }
              });
              saveRecruitPromises.push(recruit.save());
            }
            return Promise.all(saveRecruitPromises);
          });
        } else {
          return Promise.resolve([]);
        }
      });
  }).then(function (newRecruits) {
    if (isNotNullOrEmpty(phoneNumbersParam)) {
      Company.findById(currentUser.company_id).then(function (company) {
        const companyName = company.name.en;
        for (let i = 0; i < phoneNumbersParam.length; i++) {
          const phoneNumber = phoneNumbersParam[i];
          if (!registeredUserPhoneNumbers.has(phoneNumber)) {
            const toFullNumber = "+1" + phoneNumber;
            const body = companyName + ' quisiera recomendar que ud baje la aplicación Ganaz para poder recibir mensajes sobre el trabajo y tambien buscar otros trabajos en el futuro. http://www.GanazApp.com/download';
            twilioService.sendMessage(toFullNumber, body);
          }
        }
      });
    }

    if (newRecruits.length < 1) {
      return Promise.resolve([]);
    }
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