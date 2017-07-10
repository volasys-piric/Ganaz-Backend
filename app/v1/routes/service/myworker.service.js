const db = require('./../../db');

const Myworker = db.models.myworker;
const Company = db.models.company;
const Crew = db.models.crew;
const User = db.models.user;

module.exports = {
  findByCompanyId: function (companyId) {
    return Myworker.find({company_id: companyId});
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
        if (user) {
          if (user.type !== 'worker') {
            notWorkerIds.push(workerIds[i]);
          }
        } else {
          nonExistingUserIds.push(workerIds[i]);
        }
      }
      let errorMsg = '';
      if (nonExistingUserIds.length > 0) {
        errorMsg += 'Non existing user ids: ' + nonExistingUserIds.join(', ') + '. ';
      }
      if (nonExistingUserIds.length > 0) {
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
        return Promise.all(saveMyworkerPromises);
      }
    });
  },
  deleteById: function (id) {
    return Myworker.findByIdAndRemove(id)
  },
  updateNickname: function (id, nickname) {
    return Myworker.findById(id).then(function (myworker) {
      if (myworker === null) {
        return Promise.reject('Myworker with id ' + id + ' does not exists.');
      } else {
        myworker.nickname = nickname;
        return myworker.save();
      }
    })
  }
};