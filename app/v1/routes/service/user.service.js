const Promise = require('bluebird');
const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const twilio = require('twilio');
const sendMail = require('sendmail');
const logger = require('./../../../utils/logger');
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const companyService = require('./company.service');

const User = db.models.user;

const twilio_client = twilio(appConfig.TWILIO_ACCOUNT_SID, appConfig.TWILIO_AUTH_TOKEN);
const sendmail_client = sendmail();

const validate = function (body) {
  let result = null;
  if (body && body.username && body.firstname && body.lastname
    && body.type && body.auth_type) {
    if (body.auth_type === 'email' && !body.password) {
      result = Promise.reject('Password is required for auth_type email.')
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

const populateCompany = function (user, includeStats) {
  if (user.company && user.company.company_id) {
    // Only include company stats if user is company-regular or company-admin
    const includeCompanyStats = includeStats && (
        user.type.startsWith('company-regular') || user.type.startsWith('company-admin')
      );
    return companyService.getCompany(user.company.company_id, includeCompanyStats).then(function (company) {
      user.company.account = company;
      return user;
    })
  } else {
    return Promise.resolve(user);
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
      const user = new User(User.adaptLocation(body));
      // According to existing routes.js, company stats should be included.
      return populateCompany(user, true);
    }
  }).then(function (user) {
    user.password = bcrypt.hashSync(body.password);
    return user.save();
  }).then(function (user) {
    return _toObject(user);
  });
};

const update = function (id, body) {
  User.findById(id).then(function (userModel) {
    const user = Object.assign(userModel, User.adaptLocation(body));
    return user.save().then(function () {
      return user;
    })
  }).then(function (user) {
    return populateCompany(user);
  }).then(function (user) {
    return _toObject(user);
  });
};

const login = function (body) {
  return User.findOne({username: body.username}).then(function (user) {
    if (!user) {
      return Promise.reject('Authentication failed. User with username ' + body.username + ' not found.');
    } else if (body.auth_type !== user.auth_type) {
      return Promise.reject('Authentication failed. Auth type ' + +' not matched.');
    } else {
      if (body.auth_type === 'email') {
        // check if password matches
        if (!bcrypt.compareSync(body.password, user.password)) {
          return Promise.reject('Authentication failed. Wrong password.');
        }
      } else if (body.external_id !== user.external_id) {
        return Promise.reject('Authentication failed. External id not matched.');
      } else {
        return user;
      }
    }
  }).then(function (user) {
    // According to existing routes.js, company stats should be included.
    return populateCompany(user, true);
  }).then(function (user) {
    user.last_login = Date.now();
    const access_token = 'Bearer ' + jwt.sign({
        _id: user._id.toString(),
        id: user._id.toString(),
        username: user.username,
        email_address: user.email_address
      }, appConfig.secret);

    return user.save().then(function (user) {
      const o = _toObject(user);
      o.access_token = access_token;
      return o;
    });
  });
};

const findById = function (id) {
  return User.findById(id).then(function (user) {
    return _toObject(user);
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
    const addCondition = function (fieldName, crit, isRegex) {
      if (isRegex) {
        dbQ[fieldName] = new RegExp(crit, 'i');
      } else {
        dbQ[fieldName] = crit;
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
        dbQ.$or.push({country_code: countryCode, local_number: localNumber});
      } else {
        // Assumed to be 10 digit local number
        dbQ.$or.push({local_number: localNumber});
      }
    }
  }
  return _findUsers(dbQ);
};

const recoverPassRequestPin = function (username) {
  return User.findOne({username: username}).then(function (user) {
    if (user) {
      return Promise.reject('User with username ' + username + ' does not exists.');
    } else {
      // generate_pin_code() in routes.js
      const pin = Math.floor(1000 + Math.random() * 9000).toString();
      const access_token = 'Bearer ' + jwt.sign({
          _id: user._id.toString(),
          id: user._id.toString(),
          username: user.username,
          email_address: user.email_address
        }, appConfig.secret);
      //  send twilio message ignoring any errors in sending twilio messages
      _sendMessageWithPin(user, pin);
      return {pin, access_token};
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

function _toObject(user) {
  const o = user.toObject();
  // Remove password to avoid security risk
  o.password = null;
  delete o.password;
  return o;
}

function _toObjects(users) {
  const result = [];
  for (let i = 0; i < users.length; i++) {
    result.push(_toObject(users[i]));
  }
  return result;
}

function _findUsers(dbQ) {
  return User.find(dbQ).then(function (users) {
    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      users[i] = populateCompany(user);
    }
    return users;
  }).then(function (users) {
    return _toObjects(users);
  });
}

function _sendMessageWithPin(user, pin) {
  twilio_client.messages.create({
      from: appConfig.TWILIO_PHONE_NUMBER,
      to: '+' + user.phone_number.country_code + user.phone_number.local_number,
      body: 'Ganaz Pin Code: ' + pin
    },
    function (err, message) {
      if (err) {
        logger.error('[Twilio] Send invite fail. Reason: ' + err.message);
      } else {
        logger.log('[Twilio] Send invite success. Response: ' + message);
      }
    }
  )
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