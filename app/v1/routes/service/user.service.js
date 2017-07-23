const Promise = require('bluebird');
const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const twilioService = require('./../service/twilio.service');
const logger = require('./../../../utils/logger');
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const companyService = require('./company.service');

const User = db.models.user;

const validPhonePassword = function (password) {
  return /\d{4}$/.test(password);
};

const validate = function (id, body) {
  let errorMessage = '';
  if (body) {
    if (!id) {
      if (!body.firstname || !body.lastname || !body.type || !body.auth_type) {
        errorMessage = 'Request body firstname, lastname, type and auth_type are required for new users.';
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
        if (body.type !== 'worker' && body.type !== 'company-admin' && body.type !== 'company-regular') {
          errorMessage += 'Request type ' + body.type + ' is not acceptable. ';
        } else if (body.type !== 'worker' && !(body.company && body.company.company_id)) {
          errorMessage += 'Request body company.company_id is required for type ' + body.type + '. '
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
    const checkIfPhoneNumberExists = function (existingUser) {
      if (!existingUser || (
        body.phone_number && body.phone_number.local_number &&
        existingUser.phone_number.local_number !== body.phone_number.local_number)
      ) {
        return User.findOne({'phone_number.local_number': body.phone_number.local_number}).then(function (user) {
          if (user) {
            return Promise.reject('Phone number local number ' + body.phone_number.local_number + ' already exists.');
          } else {
            return Promise.resolve();
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
            return checkIfPhoneNumberExists(existingUser);
          }).then(function () {
            return existingUser;
          })
        }
      });
    } else {
      return checkIfUsernameExists(null).then(function () {
        return checkIfPhoneNumberExists(null);
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
      o.access_token = _generateToken(user);
      return populateCompany(o, true);
    })
  });
};

const update = function (id, body) {
  return validate(id, body).then(function (existingUser) {
    const deleteProperty = function (propertyName) {
      if (body[propertyName]) { // In case front end pass this
        body[propertyName] = null;
        delete body[propertyName];
      }
    };
    deleteProperty('type');
    deleteProperty('password');
    deleteProperty('company');
    deleteProperty('external_id');

    const user = Object.assign(existingUser, User.adaptLocation(body));
    return user.save().then(function () {
      return user;
    })
  }).then(function (user) {
    return populateCompany(toObject(user), true);
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
      const o = toObject(user);
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
    return populateCompany(toObject(user));
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
    addCondition('company.company_id', sParams.company_id, false);
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
      const access_token = _generateToken(user);
      //  send twilio message ignoring any errors in sending twilio messages
      const toFullNumber = '+' + user.phone_number.country_code + user.phone_number.local_number;
      return twilioService.sendMessage(toFullNumber, 'Ganaz Pin Code: ' + pin).then(function () {
        return {pin, access_token};
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
  toObject: toObject
};