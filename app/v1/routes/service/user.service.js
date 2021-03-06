const Promise = require('bluebird');
const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const mongoose = require('mongoose');
const twiliophoneService = require('./../service/twiliophone.service');
const validation = require('./../../../utils/validation');
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const companyService = require('./company.service');
const constants = require('./../../../utils/constants');
const logger = require('./../../../utils/logger');

const User = db.models.user;
const Smslog = db.models.smslog;
const Crew = db.models.crew;
const Invite = db.models.invite;

const validPhonePassword = function (password) {
  return /\d{4}$/.test(password);
};

const validate = function (id, body) {
  let errorMessage = '';
  if (body) {
    const deleteFbLeadPropertyIfEmpty = (property) => {
      if (body.worker && body.worker.hasOwnProperty('facebook_lead')
        && body.worker.facebook_lead.hasOwnProperty(property)) {
        if (!body.worker.facebook_lead[property]
          || !body.worker.facebook_lead[property].trim()
          || !mongoose.Types.ObjectId.isValid(body.worker.facebook_lead[property])) {
          delete body.worker.facebook_lead[property];
        }
      }
    };
    deleteFbLeadPropertyIfEmpty('job_id');
    deleteFbLeadPropertyIfEmpty('company_id');

    if (!id) {
      if (!body.firstname || !body.lastname || !body.type || !body.auth_type) {
        errorMessage = 'Request body firstname, lastname, type and auth_type are required for new users.';
      } else if (body.type === 'onboarding-worker') {
        errorMessage += 'Request type ' + body.type + ' is allowed to updated but not to create user record.';
      } else {
        if (body.auth_type !== 'email' &&
          body.auth_type !== 'facebook' &&
          body.auth_type !== 'twitter' &&
          body.auth_type !== 'google' &&
          body.auth_type !== 'phone') {
          errorMessage = 'Invalid auth_type ' + body.auth_type + '. Acceptable auth_type(s) are email/facebook/twitter/google/phone. ';
        } else if (body.auth_type === 'email') {
          if (!body.username || !body.password) {
            errorMessage += 'Username and password are required for auth_type email. ';
          }
        } else if (body.auth_type === 'phone') {
          if (!body.phone_number || !body.phone_number.local_number
            || !body.password || !validPhonePassword(body.password)) {
            errorMessage += 'Password and phone_number.local_number are required for auth_type phone and password must be 4 digits. ';
          }
        } else if (!body.external_id) {
          errorMessage += 'Request body external_id is required for auth_type ' + body.auth_type + '. ';
        }
        body.type = body.type.toLowerCase();
        if (body.type !== 'onboarding-worker' && body.type !== 'worker' && body.type !== 'company-admin' && body.type !== 'company-regular') {
          errorMessage += 'Request type ' + body.type + ' is not acceptable. ';
        } else if (body.type.startsWith('company-')) {
          if (!body.company || !body.company.company_id) {
            errorMessage += 'Request body company.company_id is required for type ' + body.type + '. '
          }
        }
      }
    }
  } else {
    errorMessage = 'Request body is required.';
  }
  if (errorMessage) {
    return Promise.reject(errorMessage);
  } else {
    const checkIfUsernameExists = function (existingUser) {
      if (!existingUser || existingUser.username !== body.username) {
        return User.findOne({username: body.username}).then(function (user) {
          if (user) {
            return Promise.reject('User with username ' + body.username + ' already exists');
          } else {
            return Promise.resolve();
          }
        });
      } else {
        return Promise.resolve(existingUser);
      }
    };
    const checkIfValidPhoneNumber = function(existingUser) {
      const phoneNumber = body.phone_number;
      if(!phoneNumber) {
        if(!existingUser) {
          // For new users, make phone number required.
          return Promise.reject('Request body phone_number.local_number is required.');
        } else {
          return Promise.resolve();
        }
      }
      if (!phoneNumber.country) {
        phoneNumber.country = 'US';
      }
      if (!phoneNumber.country_code) {
        phoneNumber.country_code = '1';
      }

      if (!existingUser || !existingUser.phone_number.samePhone(body.phone_number)) {
        return User.findOne({
          'phone_number.country_code': phoneNumber.country_code,
          'phone_number.local_number': phoneNumber.local_number
        }).then(function(user) {
          if (user) {
            return Promise.reject('Phone number country_code ' + phoneNumber.country_code + ' and local number ' + phoneNumber.local_number + ' already exists.');
          } else {
            if (validation.isUSPhoneNumber(phoneNumber.local_number)) {
              // Convert to plain xxxxxxxxxx
              phoneNumber.local_number = phoneNumber.local_number.replace(new RegExp('[()\\s-]', 'g'), '');
              return Promise.resolve(body);
            } else {
              return Promise.reject('Phone number ' + phoneNumber.local_number + ' is an invalid US Phone number.');
            }
          }
        });
      } else {
        return Promise.resolve(existingUser);
      }
    };

    if (id) {
      return User.findById(id).then(function (existingUser) {
        if (existingUser === null) {
          return Promise.reject('User ' + id + ' does not exists.');
        } else {
          return checkIfUsernameExists(existingUser).then(function () {
            return checkIfValidPhoneNumber(existingUser);
          }).then(function () {
            return existingUser;
          })
        }
      });
    } else {
      return checkIfUsernameExists(null).then(function () {
        return checkIfValidPhoneNumber(null);
      });
    }
  }
};

const toObject = function (user) {
  const o = user.toObject();
  // Remove password to avoid security risk
  o.password = null;
  delete o.password;
  return o;
};

const populateCompany = function (userJsonO, includeStats) {
  if (userJsonO.company && userJsonO.company.company_id) {
    // Only include company stats if user is company-regular or company-admin
    const includeCompanyStats = includeStats && (userJsonO.type === 'company-regular' || userJsonO.type === 'company-admin');
    return companyService.getCompany(userJsonO.company.company_id, includeCompanyStats).then(function (company) {
      userJsonO.company.account = company;
      return userJsonO;
    })
  } else {
    return Promise.resolve(userJsonO);
  }
};

const create = function (body) {
  return validate(null, body).then(function () {
    const user = new User(User.adaptLocation(body));
    user.password = bcrypt.hashSync(body.password);
    user.last_login = Date.now();
    return user.save().then(function (user) {
      const o = toObject(user);
      return populateCompany(o, true).then(function (o) {
        o.access_token = _generateToken(o);
        return o;
      });
    })
  });
};

const update = function (id, body) {
  return validate(id, body).then(function (existingUser) {
    const deleteProperty = function (propertyName) {
      if (body[propertyName]) { // In case  front end pass this
        body[propertyName] = null;
        delete body[propertyName];
      }
    };
    const isOnBoardingWorker = existingUser.type === 'onboarding-worker';
    const isOnBoardingCompanyGroupLeader = existingUser.type === 'onboarding-company-group-leader';
    if (isOnBoardingCompanyGroupLeader) {
      deleteProperty('company');
      deleteProperty('external_id');
    } else if (!isOnBoardingWorker) {
      deleteProperty('type');
      deleteProperty('company');
      deleteProperty('external_id');
    }

    const newPassword = body.password;
    deleteProperty('password');
    const user = Object.assign(existingUser, User.adaptLocation(body));
    const doSaveUser = (user) => {
      return user.save().then((user) => {
        const o = toObject(user);
        if (isOnBoardingWorker || isOnBoardingCompanyGroupLeader) {
          o.access_token = _generateToken(o);
        }
        return populateCompany(o, true);
      })
    };
    
    if (isOnBoardingWorker || isOnBoardingCompanyGroupLeader) {
      /*
       See https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.2.1%20User%20-%20Onboarding%20User%20Signup
       Attention!*
       This API should generate access_token and created_at, last_login fields.
       is_newjob_lock will be true if this is to complete the singup process of onboarding-worker.
       - if “onboarding-worker” => “worker”, we should set “is_newjob_lock” = true,
       */
      const now = Date.now();
      user.created_at = now;
      user.last_login = now;
      if (newPassword) {
        if (!user.password || (user.password !== newPassword && !bcrypt.compareSync(newPassword, user.password))) {
          user.password = bcrypt.hashSync(newPassword);
        }
      }
      if (body.type === 'worker') {
        if (!user.worker) {
          user.worker = {is_newjob_lock: true}
        } else {
          user.worker.is_newjob_lock = true;
        }
      }
      if (isOnBoardingWorker) {
        return doSaveUser(user);
      } else {
        // isOnBoardingCompanyGroupLeader
        const {country_code, local_number} = user.phone_number;
        const inviteQ = {
          'receiver.type': 'company-group-leader',
          'receiver.company_group_leader.phone_number.country_code': country_code,
          'receiver.company_group_leader.phone_number.local_number': local_number
        };
        return Invite.findOne(inviteQ).then((invite) => {
          if (!invite) {
            const message = `Failed to update ${id}. Invite not found.`;
            logger.error(`[User Service] ${message}`);
            return Promise.reject(message);
          } else {
            const inviteCrews = invite.receiver.company_group_leader.crews;
            if (inviteCrews && inviteCrews.length > 0) {
              return Crew.find({_id: {$in: inviteCrews}}).then((groupLeaderCrews) => {
                const companyId = invite.sender.company_id;
                const saveCrewPromises = groupLeaderCrews.map((crew) => {
                  if (crew.group_leaders) {
                    const groupLeaders = crew.group_leaders;
                    let exists = false;
                    for (let i = 0; i < groupLeaders.length; i++) {
                      if (groupLeaders.user_id === user._id) {
                        exists = true;
                        break;
                      }
                    }
                    if (!exists) {
                      groupLeaders.push({company_id: companyId, user_id: user._id})
                    }
                  } else {
                    crew.group_leaders = [{company_id: companyId, user_id: user._id}];
                  }
                  return crew.save();
                });
                return Promise.all(saveCrewPromises).then(() => doSaveUser(user));
              })
            } else {
              return doSaveUser(user);
            }
          }
        });
      }
    } else {
      return doSaveUser(user);
    }
  });
};

const login = function (body) {
  let findUserPromise = null;
  if (body.auth_type === 'phone') {
    const phoneNumberQuery = body.phone_number;
    const rightPhoneNumber = phoneNumberQuery.length >= 7 ? phoneNumberQuery.substr(-7) : phoneNumberQuery;
    findUserPromise = User.find({'phone_number.local_number': new RegExp(`${rightPhoneNumber}$`)}) // Phone number that ends with
      .then((users) => {
        let result = null;
        const fullPhoneNumber = (user) => `${user.phone_number.country_code}${user.phone_number.local_number}`;
        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          if (user.phone_number.local_number === phoneNumberQuery || fullPhoneNumber(user) === phoneNumberQuery) {
            result = user;
            break;
          }
        }
        return result;
      });
  } else {
    findUserPromise = User.findOne({username: body.username}).then(function (user) {
      if (!user) {
        return Promise.reject('Authentication failed. User with username ' + body.username + ' does not exists..')
      } else {
        return user;
      }
    });
  }
  return findUserPromise.then(function (user) {
    if (body.auth_type !== user.auth_type) {
      return Promise.reject('Authentication failed. Auth type ' + body.auth_type + ' not matched.');
    } else {
      if (body.auth_type === 'email' || body.auth_type === 'phone') {
        // check if password matches
        if (!bcrypt.compareSync(body.password, user.password)) {
          return Promise.reject('Authentication failed. Wrong password.');
        } else {
          return user;
        }
      } else if (body.external_id !== user.external_id) {
        return Promise.reject('Authentication failed. External id not matched.');
      } else {
        return user;
      }
    }
  }).then(function (user) {
    user.last_login = Date.now();
    return user.save();
  }).then(function (user) {
    const o = toObject(user);
    return populateCompany(o, true).then(function (o) {
      o.access_token = _generateToken(o);
      return o;
    });
  });
};

const findById = function (id) {
  return User.findById(id).then(function (user) {
    return populateCompany(toObject(user));
  })
};

const updateType = function (currentUserId, userIdToUpdate, type) {
  if (type !== 'company-admin' && type !== 'company-regular') {
    return Promise.reject('Invalid type in request body.');
  } else {
    return User.findById(currentUserId).then(function (currentUser) {
      if (!currentUser.company || currentUser.type !== 'company-admin') {
        return Promise.reject('You have no privilege to update the user company role');
      } else {
        return User.findById(userIdToUpdate)
          .then(function (userToUpdate) {
            if (currentUser.company.company_id !== userToUpdate.company.company_id) {
              return Promise.reject('You have no privilege to update the user company role');
            } else {
              userToUpdate.type = type;
              return userToUpdate.save();
            }
          }).then(function (user) {
            return toObject(user);
          });
      }
    });
  }
};

/*
 https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.6%20User%20-%20Search

 We should allow users to search other users in our platform
 by email_address, firstname, lastname, phone_number and type.
 Also, any will be used to search users by any terms listed above.
 phone_number search will be exact search with / without country code. Others will be “containing & case-insensitive” search.
 */
const search = function (sParams) {
  const dbQ = {};
  const phoneNumberQuery = sParams.any ? sParams.any : sParams.phone_number;
  let rightPhoneNumber = null;
  if (phoneNumberQuery) {
    rightPhoneNumber = phoneNumberQuery.length >= 7 ? phoneNumberQuery.substr(-7) : phoneNumberQuery;
  }

  if (sParams.any) {
    const regex = new RegExp(sParams.any, 'i');
    dbQ.$or = [
      {email_address: regex},
      {firstname: regex},
      {lastname: regex},
      {type: regex},
    ];
    if (rightPhoneNumber) {
      dbQ.$or.push({'phone_number.local_number': new RegExp(`${rightPhoneNumber}$`)});  // Phone number that ends with
    }
  } else {
    const addCondition = function(fieldName, conditionValue, isRegex) {
      if (conditionValue) {
        if (isRegex) {
          dbQ[fieldName] = new RegExp(conditionValue, 'i');
        } else {
          dbQ[fieldName] = conditionValue;
        }
      }
    };
    addCondition('email_address', sParams.email_address, true);
    addCondition('firstname', sParams.firstname, true);
    addCondition('lastname', sParams.lastname, true);
    addCondition('type', sParams.type, false);
    addCondition('company.company_id', sParams.company_id, false);
    if (sParams.facebook_lead) {
      if (sParams.facebook_lead.job_id && mongoose.Types.ObjectId.isValid(sParams.facebook_lead.job_id)) {
        addCondition('worker.facebook_lead.job_id', sParams.facebook_lead.job_id, false);
      }
      if (sParams.facebook_lead.company_id && mongoose.Types.ObjectId.isValid(sParams.facebook_lead.company_id)) {
        addCondition('worker.facebook_lead.company_id', sParams.facebook_lead.company_id, false);
      }
    }
    if (rightPhoneNumber) {
      dbQ['phone_number.local_number'] = new RegExp(`${rightPhoneNumber}$`);  // Phone number that ends with
    }
  }

  return User.find(dbQ).then(function(users) {
    const populateCompanyPromises = [];
    const filtedByPhoneUsers = users.filter((user) => {
      if (!user.phone_number) {
        return !phoneNumberQuery || !phoneNumberQuery.trim();
      } else {
        const fullPhoneNumber = `${user.phone_number.country_code}${user.phone_number.local_number}`;
        return user.phone_number.local_number === phoneNumberQuery || fullPhoneNumber === phoneNumberQuery;
      }
    });
    for (let i = 0; i < filtedByPhoneUsers.length; i++) {
      const user = filtedByPhoneUsers[i];
      populateCompanyPromises.push(populateCompany(toObject(user)));
    }
    return Promise.all(populateCompanyPromises);
  });
};

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.7%20User%20-%20Bulk%20Search%20By%20Phone%20Numbers
const searchPhones = function (phoneNumbers) {
  const dbQ = {};
  if (phoneNumbers && phoneNumbers.length > 0) {
    dbQ.$or = [];
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      if (phoneNumber.length === 11) {
        const countryCode = phoneNumber.charAt(0);
        const localNumber = phoneNumber.substr(1, 11);
        dbQ.$or.push({'phone_number.country_code': countryCode, 'phone_number.local_number': localNumber});
      } else {
        // Assumed to be 10 digit local number
        dbQ.$or.push({'phone_number.local_number': phoneNumber});
      }
    }
  }
  return _findUsers(dbQ);
};

const recoverPassRequestPin = function (username) {
  return User.findOne({username: username}).then(function (user) {
    if (!user) {
      return Promise.reject('User with username ' + username + ' does not exists.');
    } else {
      // generate_pin_code() in routes.js
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const o = toObject(user);
      return populateCompany(o, true).then(function (o) {
        const access_token = _generateToken(o);
        //  send twilio message ignoring any errors in sending twilio messages
        const senderUserId = user._id;
        const senderCompanyId = user.company ? user.company.company_id : null;
        const smsLog = new Smslog({
          sender: {user_id: senderUserId, company_id: senderCompanyId},
          receiver: {phone_number: user.phone_number},
          message: 'Ganaz Pin Code: ' + pin
        });
        return smsLog.save().then(function(savedSmsLog) {
          twiliophoneService.sendSmsLog(savedSmsLog);
          return {pin, access_token};
        });
      });
    }
  })
};

const phonePasswordReset = function (id, newPassword, apiVersion) {
  if (apiVersion < 1.3) { // For backward compatibility
    return User.findById(id)
      .then(function (user) {
        user.password = bcrypt.hashSync(newPassword);
        return user.save();
      }).then(function (user) {
        return toObject(user);
      });
  } else {
    if (!validPhonePassword(newPassword)) {
      return Promise.reject('Invalid phone password. Must be 4 digits.');
    } else {
      return User.findById(id)
        .then(function (user) {
          user.password = bcrypt.hashSync(newPassword);
          user.auth_type = 'phone';
          return user.save();
        }).then(function (user) {
          return toObject(user);
        });
    }
  }
};

const countByArea = function (searchBody) {
  const dbQ = {
    "worker.location.loc": {
      "$near": searchBody.area.loc,
      "$maxDistance": constants.degreeInMiles * searchBody.area.radius
    }
  };
  if (searchBody.type) {
    dbQ.type = searchBody.type;
  }
  return User.count(dbQ);
};

function _generateToken(userO) {
  const o = {
    _id: userO._id.toString(),
    id: userO._id.toString(),
    username: userO.username,
    email_address: userO.email_address
  };
  if (userO.company && userO.company.company_id) {
    o.company = {
      company_id: userO.company.company_id
    };
    if (userO.company.account) {
      o.company.company_name = userO.company.account.name.en
    }
  }
  return 'Bearer ' + jwt.sign(o, appConfig.secret);
}

function _findUsers(dbQ) {
  return User.find(dbQ).then(function (users) {
    const populateCompanyPromises = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      populateCompanyPromises.push(populateCompany(toObject(user)));
    }
    return Promise.all(populateCompanyPromises);
  });
}

module.exports = {
  validate: validate,
  create: create,
  update: update,
  login: login,
  findById: findById,
  updateType: updateType,
  search: search,
  searchPhones: searchPhones,
  recoverPassRequestPin: recoverPassRequestPin,
  phonePasswordReset: phonePasswordReset,
  validPhonePassword: validPhonePassword,
  toObject: toObject,
  countByArea: countByArea
};
