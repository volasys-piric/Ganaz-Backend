const Promise = require('bluebird');
const db = require('./../../db');

const Crew = db.models.crew;
const Myworker = db.models.myworker;
const Company = db.models.company;

module.exports = {
  findByCompanyId: function (companyId) {
    return Crew.find({company_id: companyId});
  },
  create: function (companyId, title) {
    return Company.findById(companyId).then(function (company) {
      if (company === null) {
        return Promise.reject('Company with id ' + companyId + ' does not exists.');
      } else {
        const crew = new Crew({
          company_id: companyId,
          title: title
        });
        return crew.save();
      }
    });
  },
  update: function (crewId, title) {
    return Crew.findById(crewId).then(function (crew) {
      if (crew === null) {
        return Promise.reject('Crew with id ' + crewId + ' does not exists.');
      } else {
        crew.title = title;
        return crew.save();
      }
    });
  },
  deleteById: function (id) {
    return Myworker.find({crew_id: id}).then(function (myworkers) {
      const promises = [];
      for (let i = 0; i < myworkers.length; i++) {
        const myworker = myworkers[i];
        myworker.crew_id = '';
        promises.push(myworker.save())
      }
      return Promise.all(promises);
    }).then(function () {
      return Crew.findByIdAndRemove(id)
    })
  },
};