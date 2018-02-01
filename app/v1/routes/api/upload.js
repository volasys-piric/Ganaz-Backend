const express = require('express');
const router = express.Router();
const Promise = require('bluebird');
const XLSX = require('xlsx')
const fileuploadService = require('./../service/fileupload.service');
const httpUtil = require('./../../../utils/http');
const log = require('./../../../utils/logger');
const db = require('./../../db');

const Company = db.models.company;
const User = db.models.user;
const Myworker = db.models.myworker;
const Crew = db.models.crew;

const upload = fileuploadService.multerInstance;

const _parseUserSegmentsFile = (file) => {
  const userData = [];
  const companyNames = [];
  const companyNameCrewTitlesMap = new Map();
  
  const userLocalNumbers = [];
  const sheet = _getWorksheet(file, 1);
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let startRow = range.s.r + 1; // Skip header
  
  for (let rowNum = startRow; rowNum <= range.e.r; rowNum++) {
    const row = [];
    for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
      const nextCell = sheet[XLSX.utils.encode_cell({r: rowNum, c: colNum})];
      if (typeof nextCell === 'undefined') {
        row.push(void 0);
      } else row.push(nextCell.w);
    }
    
    if (row[1]) {
      const localNumber = row[1].replace(/-/g, '');
      const companyName = row[0];
      const nickname = row[3];
      const title = row[4];
      userData.push({companyName, localNumber, nickname, title});
      if (companyNames.indexOf(companyName) === -1) {
        companyNames.push(companyName);
      }
      if (companyNameCrewTitlesMap.has(companyName)) {
        const crewTitles = companyNameCrewTitlesMap.get(companyName);
        crewTitles.push(title);
      } else {
        companyNameCrewTitlesMap.set(companyName, [title])
      }
    } else {
      let rowEmpty = true;
      for (let i = 0; i < 9; i++) {
        if (row[i]) {
          rowEmpty = false;
          break;
        }
      }
      if (!rowEmpty) {
        log.warn('[Invite Bulk] Worker Account # empty. Skipping row ' + (rowNum + 1));
      }
    }
  }
  
  return {userData, companyNames, companyNameCrewTitlesMap};
};

router.post('/usersegments', upload.single('file'), (req, res) => {
  const file = req.file;
  const result = _parseUserSegmentsFile(file);
  
  const promises = result.companyNames.map((name) => Company.findOne({'name.en': name}));
  return Promise.all(promises).then((companies) => {
    const companyNameCompanyMap = new Map();
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      companyNameCompanyMap.set(company.name.en, company);
    }
    const findCrewPromises = [];
    const companyNameCrewTitlesMap = result.companyNameCrewTitlesMap;
    for (let [companyName, crewTitles] of companyNameCrewTitlesMap.entries()) {
      const companyId = companyNameCompanyMap.get(companyName)._id.toString();
      for (let i = 0; i < crewTitles.length; i++) {
        findCrewPromises.push(Crew.findOne({company_id: companyId, title: crewTitles[i]}));
      }
    }
    return Promise.all(findCrewPromises).then((crews) => {
      const saveCrewPromises = [];
      let counter = 0;
      for (let [companyName, crewTitles] of companyNameCrewTitlesMap.entries()) {
        const companyId = companyNameCompanyMap.get(companyName)._id.toString();
        for (let i = 0; i < crewTitles.length; i++) {
          let crew = crews[counter];
          if (crew) {
            saveCrewPromises.push(Promise.resolve(crew));
          } else {
            crew = new Crew({company_id: companyId, title: crewTitles[i]});
            saveCrewPromises.push(crew.save());
          }
          counter++;
        }
      }
      return Promise.all(saveCrewPromises);
    }).then((savedCrews) => {
      const companyIdCrewTitleCrewMap = new Map();
      for (let i = 0; i < savedCrews.length; i++) {
        const crew = savedCrews[i];
        companyIdCrewTitleCrewMap.set(crew.company_id + crew.title, crew);
      }
      
      const userData = result.userData;
      const findUserPromises = [];
      for (let i = 0; i < userData.length; i++) {
        const localNumber = userData[i].localNumber;
        findUserPromises.push(User.findOne({'phone_number.local_number': localNumber}))
      }
      return Promise.all(findUserPromises).then((users) => {
        const localNumberUserMap = new Map();
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          localNumberUserMap.set(user.phone_number.local_number, user)
        }
        
        const findMyworkerPromises = [];
        for (let i = 0; i < userData.length; i++) {
          const companyId = companyNameCompanyMap.get(userData[i].companyName)._id.toString();
          const userId = localNumberUserMap.get(userData[i].localNumber)._id.toString();
          findMyworkerPromises.push(Myworker.findOne({
            company_id: companyId,
            worker_user_id: userId
          }));
        }
        return Promise.all(findMyworkerPromises).then(function(myworkers) {
          const saveMyworkerPromises = [];
          for (let i = 0; i < myworkers.length; i++) {
            let myworker = myworkers[i];
            const userD = userData[i];
            if (!myworker) {
              const companyId = companyNameCompanyMap.get(userD.companyName)._id.toString();
              myworker = new Myworker({
                company_id: companyId,
                worker_user_id: users[i]._id.toString()
              });
            }
            const crewTitle = userD.title;
            const crew = companyIdCrewTitleCrewMap.get(myworker.company_id + crewTitle);
            myworker.crew_id = crew._id.toString();
            myworker.nickname = userD.nickname;
            saveMyworkerPromises.push(myworker.save());
          }
          return Promise.all(saveMyworkerPromises);
        });
      })
    });
  }).then((myworkers) => {
    res.json({success: true, myworkers: myworkers});
  }).catch(httpUtil.handleError(res));
});

function _getWorksheet(file, worksheetNumber) {
  if (!worksheetNumber) {
    worksheetNumber = 0;
  }
  const wb = XLSX.readFile(file.path, {type: 'buffer'});
  const first_sheet_name = wb.SheetNames[worksheetNumber];
  return wb.Sheets[first_sheet_name];
}

module.exports = router;