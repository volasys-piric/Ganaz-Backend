const Promise = require('bluebird');
const db = require('./../../db');
const logger = require('./../../../utils/logger');
const twiliophoneService = require('./../service/twiliophone.service');

const Myworker = db.models.myworker;
const User = db.models.user;
const Invite = db.models.invite;
const Crew = db.models.crew;
const Smslog = db.models.smslog;

module.exports = {
  /**
   * @param invitesJson of form
   [{
      phone_number: {
        country: country,
        country_code: countryCode,
        local_number: localNumber
      },
      nickname: '', // used in myworker
      crew_name: ''
   }]
   * @param company company model who made the invites
   * @param companyUserId company user who made the invites
   * @param inviteOnlyParam [Optional] will only create invites if true
   * @returns {Promise|*|PromiseLike<T>|Promise<T>}
   */
  bulkInvite: (invitesJson, company, companyUserId, inviteOnlyParam) => {
    const companyId = company._id.toString();
    const inviteOnly = inviteOnlyParam && typeof inviteOnlyParam === 'boolean' ? inviteOnlyParam : false;
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
    const findUserPromises = [];
    // 2) Create Onboarding worker object if needed. (Please refer to 1. User - Overview, Data Model)
    for (let i = 0; i < invitesJson.length; i++) {
      const o = invitesJson[i];
      const phoneNumber = o.phone_number;
      findUserPromises.push(User.findOne({
        'phone_number.country_code': phoneNumber.country_code,
        'phone_number.local_number': phoneNumber.local_number
      }));
    }
    return Promise.all(findUserPromises).then((users) => {
      const saveUserPromises = [];
      for (let i = 0; i < users.length; i++) {
        const o = invitesJson[i];
        let user = users[i];
        if (user === null && !inviteOnly) {
          const phoneNumber = o.phone_number;
          const basicUserInfo = {
            type: 'onboarding-worker',
            username: `${phoneNumber.country_code}${phoneNumber.local_number}`, // Since username is required and must be unique
            phone_number: phoneNumber,
            worker: {
              location: {address: '', loc: [0, 0]},
              is_newjob_lock: true
            }
          };
          user = new User(basicUserInfo);
          saveUserPromises.push(user.save());
        } else if (user.type !== 'onboarding-worker') {
          const phoneNumber = o.phone_number;
          logger.warn(`[Invite Service] User with phone ${JSON.stringify(phoneNumber)} type is ${user.type}`);
          saveUserPromises.push(Promise.resolve(null));
        } else {
          saveUserPromises.push(Promise.resolve(user));
        }
        o.user = user.toObject();
        o.user_id = user && user._id.toString();
      }
      return Promise.all(saveUserPromises);
    }).then(() => {
      const findInvitePromises = [];
      for (let i = 0; i < invitesJson.length; i++) {
        const o = invitesJson[i];
        const phoneNumber = o.phone_number;
        findInvitePromises.push(Invite.findOne({
          company_id: companyId,
          'phone_number.country_code': phoneNumber.country_code,
          'phone_number.local_number': phoneNumber.local_number
        }));
      }
      return Promise.all(findInvitePromises);
    }).then((invites) => {
      const saveInvitePromises = [];
      for (let i = 0; i < invitesJson.length; i++) {
        const o = invitesJson[i];
        let invite = invites[i];
        if (invite === null) {
          invite = new Invite({
            company_id: companyId,
            phone_number: o.phone_number
          });
          invite.user_id = o.user_id;
          saveInvitePromises.push(invite.save());
        } else if (o.user_id) {
          invite.user_id = o.user_id;
          saveInvitePromises.push(invite.save());
        } else {
          saveInvitePromises.push(Promise.resolve(invite));
        }
        o.invite = invite.toObject();
      }
      return Promise.all(saveInvitePromises);
    }).then(() => {
      const crewTitles = [];
      if (!inviteOnly) {
        // https://bitbucket.org/volasys-ss/ganaz-backend/issues/26/admin-portal-phone-number-bulk-upload-with
        // One thing to consider is, if new crew name is mentioned in CSV file, we need to create new crew with that name..
        for (let i = 0; i < invitesJson.length; i++) {
          let crewName = invitesJson[i].crew_name;
          if (crewName && crewName.trim()) {
            crewName = crewName.trim();
            if (crewTitles.indexOf(crewName) === -1) {
              crewTitles.push(crewName);
            }
          }
        }
      }
      if (crewTitles.length > 0) {
        return Crew.find({
          company_id: companyId,
          title: {$in: crewTitles.map((title) => new RegExp('^' + title + '$', 'i'))}
        }).then((crews) => {
          const crewTitleCrewMap = {};
          const getIndex = (title) => {
            let i = 0;
            for (; i < crewTitles.length; i++) {
              if (crewTitles[i].toLowerCase() === title.toLowerCase()) {
                break;
              }
            }
            return i;
          };
          for (let i = 0; i < crews.length; i++) {
            const crew = crews[i];
            const title = crew.title.trim().toLowerCase();
            crewTitles.splice(getIndex(title), 1);
            crewTitleCrewMap[title] = crew;
          }
          if (crewTitles.length > 0) {
            const saveCrewPromises = [];
            for (let i = 0; i < crewTitles.length; i++) {
              saveCrewPromises.push(new Crew({company_id: companyId, title: crewTitles[i]}).save());
            }
            return Promise.all(saveCrewPromises).then((crews) => {
              for (let i = 0; i < crews.length; i++) {
                const crew = crews[i];
                const title = crew.title.trim().toLowerCase();
                crewTitleCrewMap[title] = crew;
              }
              return crewTitleCrewMap;
            })
          } else {
            return crewTitleCrewMap;
          }
        })
      } else {
        return Promise.resolve([]);
      }
    }).then((crewTitleCrewMap) => {
      const findMyworkerPromises = [];
      if (!inviteOnly) {
        for (let i = 0; i < invitesJson.length; i++) {
          const o = invitesJson[i];
          const userId = o.user_id;
          findMyworkerPromises.push(Myworker.findOne({company_id: companyId, worker_user_id: userId}));
        }
      }
      return Promise.all(findMyworkerPromises).then((myworkers) => {
        const saveMyworkerPromises = [];
        if (!inviteOnly) {
          // 3) Add onboarding-worker to my-workers list of the company if needed.
          for (let i = 0; i < invitesJson.length; i++) {
            const o = invitesJson[i];
            let crewId = null;
            let crewName = o.crew_name;
            if (crewName && crewName.trim()) {
              crewName = crewName.toLowerCase();
              const crew = crewTitleCrewMap[crewName];
              o.crew = crew.toObject();
              crewId = crew._id.toString();
            }
            let myworker = myworkers[i];
            if (!myworker) {
              myworker = new Myworker({
                company_id: companyId,
                worker_user_id: o.user_id,
                crew_id: crewId
              });
            } else if (crewId) {
              myworker.crew_id = crewId;
            }
            myworker.nickname = o.nickname;
            saveMyworkerPromises.push(myworker.save());

            o.myworker = myworker.toObject();
          }
        }
        return Promise.all(saveMyworkerPromises);
      });
    }).then(() => {
      const saveSmsLog = [];
      if (!inviteOnly) {
        let findCompanyUserId = null;
        if (!companyUserId) {
          findCompanyUserId = User.findOne({'company.company_id': companyId, type: 'company-admin'})
            .then((companyUser) => {
              if (!companyUser) {
                return User.findOne({'company.company_id': companyId, type: 'company-regular'});
              } else {
                return companyUser;
              }
            }).then((companyUser) => {
              return companyUser ? companyUser._id.toString() : null;
            });
        } else {
          findCompanyUserId = Promise.resolve(companyUserId);
        }
        return findCompanyUserId.then((companyUserId) => {
          for (let i = 0; i < invitesJson.length; i++) {
            const o = invitesJson[i];
            const phoneNumber = o.phone_number;
            const messageBody = company.getInvitationMessage(phoneNumber.local_number);
            const smsLog = new Smslog({
              sender: {user_id: companyUserId, company_id: company._id},
              receiver: {phone_number: phoneNumber},
              billable: false,
              message: messageBody
            });
            o.smsLog = smsLog;
            (function(inviteJson) {
              saveSmsLog.push(smsLog.save().then((savedSmsLog) => {
                // Save asynchronously
                twiliophoneService.sendSmsLogByWorker(savedSmsLog, inviteJson.myworker);
                return savedSmsLog;
              }));
            })(o);
          }
        });
      }
      return Promise.all(saveSmsLog);
    }).then(() => {
      return invitesJson;
    });
  }
};
