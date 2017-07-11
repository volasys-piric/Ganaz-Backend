const Promise = require('bluebird');
const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const twilioService = require('./../service/twilio.service');
const logger = require('./../../../utils/logger');
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const companyService = require('./company.service');

const User = db.models.user;

const validate = function (body) {
  let result = null;
  if (body && body.username && body.firstname && body.lastname
    && body.type && body.auth_type) {
    if (body.auth_type !== 'email' &&
      body.auth_type !== 'facebook' &&
      body.auth_type !== 'twitter' &&
      body.auth_type !== 'google' &&
      body.auth_type !== 'phone') {
      result = Promise.reject('Invalid auth_type ' + body.auth_type + '. Acceptable auth_type(s) are email/facebook/twitter/google/phone.')
    } else if (body.auth_type === 'email' && !body.password) {
      result = Promise.reject('Password is required for auth_type email.')
    } else if (body.auth_type === 'phone' && (!body.password || !/\d{4}$/.test(body.password) )) {
      result = Promise.reject('Password is required for auth_type phone and must be 4 digits.')
    } else if (body.type !== 'worker' && body.type !== 'company-admin' && body.type !== 'company-regular') {
      result = Promise.reject('Request type ' + body.type + ' is not acceptable.')
    } else if (body.type !== 'worker' && !(body.company && body.company.company_id)) {
      result = Promise.reject('Request body company.company_id is required for type ' + body.type + '.')
    } else {
      body.type = body.type.toLowerCase();
      result = Promise.resolve();
    }
  } else {
    result = Promise.reject('Request body username, firstname, lastname, type and auth_type are required.')
  }
  return result;
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
  const findPromises = [User.findOne({username: body.username})];
  if (body.auth_type === 'email') {
    findPromises.push(User.findOne({email_address: body.email_address}))
  } else {
    findPromises.push(Promise.resolve(null));
  }
  return Promise.all(findPromises).then(function (findPromises) {
    const existingUser = findPromises[0];
    const existingEmail = findPromises[1];
    if (existingUser) {
      return Promise.reject('User with username ' + body.username + ' already exists.');
    } else if (existingEmail) {
      return Promise.reject('User with email ' + body.email_address + ' already exists.');
    } else {
      return new User(User.adaptLocation(body));
    }
  }).then(function (user) {
    user.password = bcrypt.hashSync(body.password);
    return user.save();
  }).then(function (user) {
    return _toObject(user);
  }).then(function (userO) {
    // According to existing routes.js, company stats should be included.
    return populateCompany(userO, true);
  });
};

const update = function (id, body) {
  return User.findById(id).then(function (userModel) {
    const user = Object.assign(userModel, User.adaptLocation(body));
    return user.save().then(function () {
      return user;
    })
  }).then(function (user) {
    return _toObject(user);
  }).then(function (userO) {
    return populateCompany(userO);
  });
};

const login = function (body) {
  let findUserPromise = null;
  if (body.auth_type === 'phone') {
    findUserPromise = User.findOne({'phone_number.local_number': body.phone_number}).then(function (user) {
      if (!user) {
        return Promise.reject('Authentication failed. User with phone_number.local_number ' + body.phone_number + ' does not exists..')
      } else {
        return user;
      }
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
    return user.save().then(function (user) {
      const o = _toObject(user);
      o.access_token = _generateToken(user);
      return o;
    });
  }).then(function (userO) {
    // According to existing routes.js, company stats should be included.
    return populateCompany(userO, true);
  });
};

const findById = function (id) {
  return User.findById(id).then(function (user) {
    return populateCompany(_toObject(user));
  })
};

const updateType = function (currentUserId, userIdToUpdate, type) {
  if (type !== 'company-admin' && type !== 'company-regular') {
    return Promise.reject('Invalid type in request body.');
  } else {
    return User.findById(currentUserId).then(function (currentUser) {
      if (!currentUser.company || currentUser.type != 'company-admin') {
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
            return _toObject(user);
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
  if (sParams.any) {
    const regex = new RegExp(sParams.any, 'i');
    dbQ.$or = [
      {email_address: regex},
      {firstname: regex},
      {lastname: regex},
      {type: regex},
      {'phone_number.local_number': sParams.any}
    ];
  } else {
    const addCondition = function (fieldName, conditionValue, isRegex) {
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
    addCondition('phone_number.local_number', sParams.phone_number, false);
    addCondition('type', sParams.type, true);
  }
  return _findUsers(dbQ);
};

// https://bitbucket.org/volasys-ss/ganaz-backend/wiki/1.7%20User%20-%20Bulk%20Search%20By%20Phone%20Numbers
const searchPhones = function (phoneNumbers) {
  const dbQ = {};
  if (phoneNumbers && phoneNumbers.length > 0) {
    dbQ.$or = [];
    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      if (phoneNumber.length == 11) {
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
      const access_token = _generateToken(user);
      //  send twilio message ignoring any errors in sending twilio messages
      const toFullNumber = '+' + user.phone_number.country_code + user.phone_number.local_number;
      return twilioService.sendMessage(toFullNumber, 'Ganaz Pin Code: ' + pin).then(function () {
        return {pin, access_token};
      });
    }
  })
};

const updatePassword = function (id, newPassword) {
  return User.findById(id)
    .then(function (user) {
      user.password = bcrypt.hashSync(newPassword);
      user.auth_type = 'email';
      return user.save();
    }).then(function (user) {
      return _toObject(user);
    });
};

function _generateToken(user) {
  const o = {
    _id: user._id.toString(),
    id: user._id.toString(),
    username: user.username,
    email_address: user.email_address
  };
  if (user.company && user.company.company_id) {
    o.company = {
      company_id: user.company.company_id
    }
  }
  return 'Bearer ' + jwt.sign(o, appConfig.secret);
}

function _toObject(user) {
  const o = user.toObject();
  // Remove password to avoid security risk
  o.password = null;
  delete o.password;
  return o;
}

function _findUsers(dbQ) {
  return User.find(dbQ).then(function (users) {
    const populateCompanyPromises = [];
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      populateCompanyPromises.push(populateCompany(_toObject(user)));
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
  updatePassword: updatePassword
};