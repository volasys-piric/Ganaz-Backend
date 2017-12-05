const db = require('./../../db');

const Myworker = db.models.myworker;
const Company = db.models.company;
const Crew = db.models.crew;
const User = db.models.user;
const userService = require('./user.service');

module.exports = {
  findByCompanyId: function (companyId) {
    return Myworker.find({company_id: companyId}).then(function (myworkers) {
      const userPromises = [];
      for (let i = 0; i < myworkers.length; i++) {
        userPromises.push(User.findById(myworkers[i].worker_user_id));
      }
      return Promise.all(userPromises).then(function (users) {
        const result = [];
        for (let i = 0; i < myworkers.length; i++) {
          const o = myworkers[i].toObject();
          o.worker_account = userService.toObject(users[i]);
          result.push(o);
        }
        return result;
      });
    });
  },
  create: function (companyId, body) {
    const workerIds = body.worker_user_ids;
    const crewId = body.crew_id;
    return Company.findById(companyId).then(function (company) {
      if (company === null) {
        return Promise.reject('Company with id ' + companyId + ' does not exists.');
      } else {
        return crewId ? Crew.findById(crewId) : null;
      }
    }).then(function (crew) {
      if (crew === null && crewId) {
        return Promise.reject('Crew with id ' + crewId + ' does not exists.');
      } else {
        const findUserPromises = [];
        for (let i = 0; i < workerIds.length; i++) {
          findUserPromises.push(User.findById(workerIds[i]));
        }
        return Promise.all(findUserPromises);
      }
    }).then(function (users) {
      const nonExistingUserIds = [];
      const notWorkerIds = [];
      for (let i = 0; i < users.length; i++) {
        const user = users[i];
        if (!user) {
          nonExistingUserIds.push(workerIds[i]);
        } else if (user.type !== 'worker' && user.type !== 'onboarding-worker') {
          notWorkerIds.push(workerIds[i]);
        }
      }
      let errorMsg = '';
      if (nonExistingUserIds.length > 0) {
        errorMsg += 'Non existing user ids: ' + nonExistingUserIds.join(', ') + '. ';
      }
      if (notWorkerIds.length > 0) {
        errorMsg += 'Not worker user ids: ' + notWorkerIds.join(', ') + '.';
      }
      if (errorMsg) {
        return Promise.reject(errorMsg);
      } else {
        const saveMyworkerPromises = [];
        for (let i = 0; i < workerIds.length; i++) {
          const myworker = new Myworker({
            company_id: companyId,
            worker_user_id: workerIds[i],
            crew_id: crewId
          });
          saveMyworkerPromises.push(myworker.save());
        }
        return Promise.all(saveMyworkerPromises).then(function (savedMyworkers) {
          const result = [];
          for (let i = 0; i < savedMyworkers.length; i++) {
            const o = savedMyworkers[i].toObject();
            o.worker_account = userService.toObject(users[i]);
            result.push(o);
          }
          return result;
        })
      }
    });
  },
  deleteById: function (id) {
    return Myworker.findByIdAndRemove(id)
  },
  update: function (id, nickname, crewId) {
    return Myworker.findById(id).then(function (myworker) {
      if (myworker === null) {
        return Promise.reject('Myworker with id ' + id + ' does not exists.');
      } else {
        if (nickname !== undefined) {
          myworker.nickname = nickname;
        }
        if (crewId !== undefined) {
          myworker.crew_id = crewId;
        }
        return myworker.save().then(function (myworker) {
          return User.findById(myworker.worker_user_id).then(function (user) {
            const o = myworker.toObject();
            o.worker_account = userService.toObject(user);
            return o;
          });
        });
      }
    })
  },
  findByCompanyIdWorkerUserId: function (companyId, workerUserId) {
    return Myworker.findOne({company_id: companyId, worker_user_id: workerUserId});
  },
  createOne: function (companyId, workerUserId) {
    // TODO: What about nickname and crew_id?
    const myworker = new Myworker({
      company_id: companyId,
      worker_user_id: workerUserId
    });
    return myworker.save();
  }
};