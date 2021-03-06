const Promise = require('bluebird');
const db = require('./../../db');

const Myworker = db.models.myworker;
const Company = db.models.company;
const Crew = db.models.crew;
const User = db.models.user;
const userService = require('./user.service');

module.exports = {
  findOnboardingByCompanyId: function(companyId) {
    return Myworker.find({company_id: companyId}).then(function(myworkers) {
      const userPromises = [];
      for (let i = 0; i < myworkers.length; i++) {
        userPromises.push(User.findById(myworkers[i].worker_user_id));
      }
      return Promise.all(userPromises).then(function(users) {
        const result = [];
        for (let i = 0; i < myworkers.length; i++) {
          const u = users[i];
          if (u.type === 'onboarding-worker') {
            const o = myworkers[i].toObject();
            o.worker_account = userService.toObject(u);
            result.push(o);
          }
        }
        return result;
      });
    });
  },
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
  update: function (id, body) {
    return Myworker.findById(id).then(function (myworker) {
      if (myworker === null) {
        return Promise.reject('Myworker with id ' + id + ' does not exists.');
      } else {
        if (body.nickname !== undefined) {
          myworker.nickname = body.nickname;
        }
        if (body.crew_id !== undefined) {
          myworker.crew_id = body.crew_id;
        }
        if (body.twilio_phone_id !== undefined) {
          myworker.twilio_phone_id = body.twilio_phone_id;
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
  unsetTwilioPhones: function(twiliophone, companyIds) {
    const id = twiliophone._id.toString();
    if (companyIds.length > 0) {
      return Myworker.update({
        twilio_phone_id: id,
        company_id: {$in: companyIds}
      }, {$unset: {twilio_phone_id: 1}}, {multi: true});
    } else if(twiliophone.is_default) {
      return Myworker.update({
        twilio_phone_id: id
      }, {$unset: {twilio_phone_id: 1}}, {multi: true});
    } else {
      return Promise.resolve();
    }
  }
};
