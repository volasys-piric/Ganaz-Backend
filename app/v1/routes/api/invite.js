const express = require('express');
const router = express.Router();
const Promise = require('bluebird');
const XLSX = require('xlsx');
const os = require('os');
const fs = require('fs');
const twiliophoneService = require('./../service/twiliophone.service');
const formatter = require('./../../../../app/utils/formatter');
const httpUtil = require('./../../../utils/http');
const log = require('./../../../utils/logger');
const db = require('./../../db');

const Invite = db.models.invite;
const Company = db.models.company;
const User = db.models.user;
const Myworker = db.models.myworker;
const Smslog = db.models.smslog;
const Crew = db.models.crew;

const dir = os.tmpdir() + '/ganaz-backend-uploads/';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, dir)
  },
  filename: function (req, file, cb) {
    const now = new Date();
    const filename = formatter.formatDateToYYYYMMDDHHmm(now) + '_' + file.originalname;
    cb(null, filename)
  }
});
const upload = multer({storage: storage});

router.post('/', function (req, res) {
  /** Expected req.body
   {
       "company_id": "{sender's company object id}",
       "user_id": "{sender's user object id, optional}",        [optional]
       "phone_number": {
           "country": "US",
           "country_code": "1",
           "local_number": "{local phone number}"
       },
       "crew_name" : '', // optional
       "invite_only": true / false             // optional
   }
   */
  const body = req.body;
  if (!body.company_id || !(body.phone_number && body.phone_number.local_number)) {
    res.json({
      success: false,
      msg: 'Request body company_id and phone_number.local_number are required.'
    })
  } else {
    const phoneNumber = body.phone_number;
    if (!phoneNumber.country_code) {
      phoneNumber.country = 'US';
      phoneNumber.country_code = '1';
    }
    /*
     https://bitbucket.org/volasys-ss/ganaz-backend/wiki/11.1%20Invite%20-%20New#markdown-header-change-log-v15
     CHANGE LOG: v1.5
     Backend will check if the phone number is already invited by the company. If not, it will do the followings.
     A. invite_only is not specified, or if it's false
     - Create Invite object if needed.
     - Create Onboarding worker object if needed. (Please refer to 1. User - Overview, Data Model)
     - Add onboarding-worker to my-workers list of the company if needed.
     - Regardless if invite was created or existing in DB, always Send SMS.
     B. invite_only = true
     - Create Invite object if needed
     - Regardless if invite was created or existing in DB, always Send SMS.
     */
    const inviteOnly = body.invite_only && typeof body.invite_only === 'boolean' ? body.invite_only : false;
    const companyId = body.company_id;
    const companyUserId = body.user_id ? body.user_id : req.user.id;
    return Promise.join(
      Invite.findOne({
        company_id: companyId,
        'phone_number.country_code': phoneNumber.country_code,
        'phone_number.local_number': phoneNumber.local_number
      }),
      Company.findById(body.company_id)
    ).then(function (promiseResult) {
      let invite = promiseResult[0];
      const company = promiseResult[1];
      if (invite === null) {
        if (company === null) {
          return Promise.reject('Company with id ' + body.company_id + ' does not exists.');
        }
        // 1) Create Invite object if needed.
        invite = new Invite(req.body);
        return invite.save().then(function (invite) {
          log.info('[Invite] Created invite record with info: ' + JSON.stringify(invite) + '.');
          return {invite: invite, company: company, isNew: true};
        });
      } else {
        return {invite: invite, company: company, isNew: false};
      }
    }).then(function (result) {
      if (!inviteOnly) {
        // 2) Create Onboarding worker object if needed. (Please refer to 1. User - Overview, Data Model)
        return User.findOne({
          'phone_number.country_code': phoneNumber.country_code,
          'phone_number.local_number': phoneNumber.local_number
        }).then(function (user) {
          if (user === null) {
            const basicUserInfo = {
              type: 'onboarding-worker',
              username: phoneNumber.local_number, // Since username is required and must be unique, so let's set this to localNumber
              phone_number: phoneNumber,
              worker: {
                location: {address: '', loc: [0, 0]},
                is_newjob_lock: true
              }
            };
            const user = new User(basicUserInfo);
            return user.save().then(function (savedUser) {
              log.info('[Invite] Created onboarding user with info: ' + JSON.stringify(basicUserInfo) + '.');
              result.onboardingWorker = savedUser;
              return result;
            });
          } else if (user.type === 'onboarding-worker') {
            result.onboardingWorker = user;
            return result;
          } else {
            return result;
          }
        });
      } else {
        return result;
      }
    }).then(function (result) {
      if (!inviteOnly && result.onboardingWorker) {
        // 3) Add onboarding-worker to my-workers list of the company if needed.
        const userId = result.onboardingWorker._id.toString();
        return Myworker.findOne({
          company_id: companyId,
          worker_user_id: userId,
        }).then(function (myworker) {
          if (myworker === null) {
            myworker = new Myworker({company_id: companyId, worker_user_id: userId});
            return myworker.save().then(function (myworker) {
              result.myworker = myworker;
              return result;
            });
          } else {
            result.myworker = myworker;
            return result;
          }
        });
      } else {
        return result;
      }
    }).then(function (result) {
      // https://bitbucket.org/volasys-ss/ganaz-backend/issues/26/admin-portal-phone-number-bulk-upload-with
      // One thing to consider is, if new crew name is mentioned in CSV file, we need to create new crew with that name..
      const myworker = result.myworker;
      if(myworker && (body.nickname || body.crew_name)) {
        if(body.nickname) {
          myworker.nickname = body.nickname;
        }
        if (body.crew_name) {
          return Crew.findOne({company_id: companyId, title: body.crew_name}).then(function(crew) {
            if (crew) {
              return crew;
            } else {
              const crew = new Crew({company_id: companyId, title: body.crew_name});
              return crew.save()
            }
          }).then(function(crew) {
            myworker.crew_id = crew._id.toString();
            return myworker.save();
          }).then(function() {
            return result;
          });
        } else {
          return myworker.save().then(function () {
            return result;
          });
        }
      } else {
        return result;
      }
    }).then(function (result) {
      const invite = result.invite;
      const company = result.company;
      const phoneNumber = invite.phone_number;
      const messageBody = company.getInvitationMessage(phoneNumber.local_number);
      const smsLog = new Smslog({
        sender: {user_id: companyUserId, company_id: companyId},
        receiver: {phone_number: phoneNumber},
        billable: false,
        message: messageBody
      });
      return smsLog.save().then(function (savedSmsLog) {
        twiliophoneService.findAndSendToAvailTwiliophone(savedSmsLog, result.myworker );
        return result;
      });
    }).then(function (result) {
      const json = {success: true};
      if (result.isNew) {
        json.invite = result.invite;
      }
      res.json(json);
    }).catch(httpUtil.handleError(res));
  }
});

function _getFirstWorksheet(file) {
  const wb = XLSX.readFile(file.path, {type: 'buffer'});
  const first_sheet_name = wb.SheetNames[0];
  return wb.Sheets[first_sheet_name];
}

function _parseSheet(sheet) {
  const result = [];
  const range = XLSX.utils.decode_range(sheet['!ref']);
  let startRow = range.s.r + 1; // Skip header
  const accountNos = [];
  for (let rowNum = startRow; rowNum <= range.e.r; rowNum++) {
    const row = [];
    for (let colNum = range.s.c; colNum <= range.e.c; colNum++) {
      const nextCell = sheet[XLSX.utils.encode_cell({r: rowNum, c: colNum})];
      if (typeof nextCell === 'undefined') {
        row.push(void 0);
      } else row.push(nextCell.w);
    }
    
    if (row[8]) {
      row[8] = row[8].replace(/-/g, '');
      let skipped = false;
      let msg = '';
      if (accountNos.indexOf(row[8]) !== -1) {
        skipped = true;
        msg = 'Duplicate Worker Account #';
        log.warn('[Invite Bulk] Duplicate Worker Account ' + row[8] + '. Skipping row ' + (rowNum + 1));
      } else {
        accountNos.push(row[8]);
      }
      result.push({excelRowNumber: rowNum, row: row, msg: msg, skipped: skipped});
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
  return result;
}

function _populateUsers(rows) {
  const promises = [];
  for (let i = 0; i < rows.length; i++) {
    const localNumber = rows[i].row[8];
    promises.push(User.findOne({'phone_number.country_code': '1', 'phone_number.local_number': localNumber}));
  }
  return Promise.all(promises).then(function (users) {
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      if (user) {
        rows[i].userId = user._id.toString();
        if (user.type !== 'worker' && user.type !== 'onboarding-worker') {
          rows[i].skipped = true;
          rows[i].msg = 'User with phone number ' + user.phone_number.local_number + ' exists but user type is ' + user.type + '.';
          log.warn('[Invite Bulk]' + rows[i].msg);
        }
      }
    }
    return rows;
  });
}

function _saveNoUserRows(now, companyId, companyUserId, company, noUserRows, sendSms) {
  if (!noUserRows || noUserRows.length < 1) {
    return Promise.resolve(noUserRows);
  }
  const companyName = company.name.en;
  // 4.a Create Invite object if needed
  // 4.b We will create new onboarding-worker object
  const promises = [];
  for (let i = 0; i < noUserRows.length; i++) {
    const localNumber = noUserRows[i].row[8];
    const phoneNumber = {
      country: 'US',
      country_code: '1',
      local_number: localNumber
    };
    const invite = new Invite({
      company_id: companyId,
      user_id: companyUserId,
      phone_number: phoneNumber,
      created_at: now
    });
    const user = new User({
      type: 'onboarding-worker',
      username: localNumber,
      firstname: 'worker_fname',
      lastname: 'worker_lname',
      phone_number: phoneNumber,
      worker: {
        location: {address: '', loc: [0, 0]},
        is_newjob_lock: true
      },
      created_at: now
    });
    promises.push(invite.save());
    promises.push(user.save());
  }
  return Promise.all(promises).then(function (promisesResult) {
    // 4.c Add newly created onboarding worker to my-workers list of the company,
    // with the nickname from cell H in excel file.
    const myworkerPromises = [];
    for (let i = 0, j = 0; i < promisesResult.length; i += 2, j++) {
      const row = noUserRows[j];
      row.msg += 'Invite created.';
      row.inviteId = promisesResult[i]._id.toString();
      const userId = promisesResult[i + 1]._id.toString();
      row.msg += ' Onboarding user created.';
      row.userId = userId;
      const myworker = new Myworker({
        company_id: companyId,
        worker_user_id: userId,
        nickname: row.row[7],
        created_at: now
      });
      myworkerPromises.push(myworker.save());
    }
    return Promise.all(myworkerPromises).then(function (savedMyworkers) {
      for (let i = 0; i < noUserRows.length; i++) {
        noUserRows[i].msg += ' Myworker created.';
        noUserRows[i].myworker = savedMyworkers[i];
      }
      return noUserRows;
    });
  }).then(function (noUserRows) {
    // 4.d Send SMS (not billable when we log to SMS-LOG table) for invitation.
    // The invitation message will be same as what we do for Invite.
    const smsLogPromises = [];
    for (let i = 0; i < noUserRows.length; i++) {
      const cellNumber = noUserRows[i].row[4].replace(/-/g, '');
      const phoneNumber = {
        country: '',
        country_code: '1',
        local_number: cellNumber
      };
      if (cellNumber.length > 10) {
        // Mexican, eg, 011526531293095
        phoneNumber.country_code = cellNumber.substr(0, cellNumber.length - 10);
        phoneNumber.local_number = cellNumber.slice(cellNumber.length - 10);
      } else {
        phoneNumber.country = 'US';
      }
      const messageBody = company.getInvitationMessage(phoneNumber.local_number);
      const smsLog = new Smslog({
        sender: {user_id: companyUserId, company_id: companyId},
        receiver: {phone_number: phoneNumber},
        billable: false,
        datetime: now,
        message: messageBody
      });
      smsLogPromises.push(smsLog.save());
    }
    return Promise.all(smsLogPromises).then(function (savedSmsLogs) {
      if (sendSms) {
        for (let i = 0; i < noUserRows.length; i++) {
          twiliophoneService.findAndSendToAvailTwiliophone(savedSmsLogs[i], noUserRows[i].myworker);
        }
      } else {
        log.info('[Invite Bulk] Skipping sending SMS.');
      }
      return noUserRows;
    });
  });
}

function _saveWithUserRows(now, companyId, withUserRows) {
  if (!withUserRows || withUserRows.length < 1) {
    return Promise.resolve(withUserRows);
  }
  // 1. If the phone number is already registered in our platform...
  const getMyWorkerPromises = [];
  for (let i = 0; i < withUserRows.length; i++) {
    getMyWorkerPromises.push(Myworker.findOne({
      company_id: companyId,
      worker_user_id: withUserRows[i].userId
    }));
  }
  return Promise.all(getMyWorkerPromises).then(function (getMyworkerResults) {
    const saveMyworkerPromises = [];
    for (let i = 0; i < getMyworkerResults.length; i++) {
      const nickname = withUserRows[i].row[7];
      let myworker = getMyworkerResults[i];
      if (myworker) {
        // 5.a If the worker is already added to my-worker list of this company, just update nickname.
        myworker.nickname = nickname;
      } else {
        // 5.b If worker is not added to my-worker list of this company yet, we need to add it as my-worker with correct nickname.
        myworker = new Myworker({
          company_id: companyId,
          worker_user_id: withUserRows[i].userId,
          nickname: nickname,
          created_at: now
        });
      }
      saveMyworkerPromises.push(myworker.save());
    }
    return Promise.all(saveMyworkerPromises).then(function (savedMyWorkers) {
      for (let i = 0; i < savedMyWorkers.length; i++) {
        const savedMyworker = savedMyWorkers[i];
        withUserRows[i].myworkerId = savedMyworker._id.toString();
        if (getMyworkerResults[i]) {
          withUserRows[i].msg = 'Myworker nickname updated.';
        } else {
          withUserRows[i].msg = 'Myworker created.';
        }
      }
      return withUserRows;
    });
  });
}

router.post('/bulk', upload.single('file'), function (req, res) {
  const body = req.body;
  const companyId = body.company_id;
  const companyUserId = body.user_id;
  if (!companyId || !companyUserId) {
    res.json({
      success: false,
      msg: 'Request body company_id and user_id are required.'
    })
  } else {
    Company.findById(body.company_id).then(function (company) {
      const file = req.file;
      let rows = _parseSheet(_getFirstWorksheet(file));
      _populateUsers(rows).then(function (rows) {
        const noUserRows = [];
        const withUserRows = [];
        for (let i = 0; i < rows.length; i++) {
          if (!rows[i].skipped) {
            if (rows[i].userId) {
              withUserRows.push(rows[i]);
            } else {
              noUserRows.push(rows[i]);
            }
          }
        }
        const now = Date.now();
        let sendSms = true;
        if (body.send_sms !== 'undefined') {
          if (typeof body.send_sms === 'boolean') {
            sendSms = body.send_sms;
          } else if (body.send_sms === 'false') {
            sendSms = false;
          }
        }
        return _saveNoUserRows(now, companyId, companyUserId, company, noUserRows, sendSms).then(function (noUserRows) {
          return _saveWithUserRows(now, body.company_id, withUserRows).then(function (withUserRows) {
            rows = rows.map(function (row) {
              // Delete row.row from response
              row.row = undefined;
              delete row.row;
              return row;
            });
            return rows;
          });
        });
      }).then(function (rows) {
        res.json({
          success: true,
          rows: rows
        });
      }).catch(httpUtil.handleError(res));
    });
  }
});

module.exports = router;