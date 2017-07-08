const Promise = require('bluebird');
const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const companyService = require('./company.service');
const User = db.models.user;

const validate = function (body) {
  let result = null;
  if (body && body.username && body.firstname && body.lastname
    && body.type && body.auth_type) {
    if (body.auth_type === 'email' && !body.password) {
      result = Promise.reject('Password is required for auth_type email.')
    } else if (body.type !== 'worker' && !(body.company && body.company.company_id)) {
      result = Promise.reject('Request body username, firstname, lastname, type and auth_type are required.')
    } else {
      result = Promise.resolve();
    }
  } else {
    result = Promise.reject('Request body username, firstname, lastname, type and auth_type are required.')
  }
  return result;
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
      if (user.company && user.company.company_id) {
        return companyService.getCompany(user.company.company_id, true).then(function (company) {
          user.company.account = company;
          return user;
        })
      } else {
        return user;
      }
    }
  }).then(function (user) {
    user.password = bcrypt.hashSync(body.password);
    return user.save().then(function () {
      return user;
    })
  });
};

const update = function (id, body) {
  User.findById(id).then(function (userModel) {
    const user = Object.assign(userModel, User.adaptLocation(body));
    return user.save().then(function () {
      return user;
    })
  }).then(function (user) {
    if (user.company && user.company.company_id) {
      return companyService.getCompany(user.company.company_id, true).then(function (company) {
        user.company.account = company;
        return user;
      })
    } else {
      return user;
    }
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
    if (user.company && user.company.company_id) {
      return companyService.getCompany(user.company.company_id, true).then(function (company) {
        user.company.account = company;
        return user;
      })
    } else {
      return user;
    }
  }).then(function (user) {
    user.last_login = Date.now();
    user.access_token = 'Bearer ' + jwt.sign({
        _id: user._id.toString(),
        username: user.username,
        email_address: user.email_address
      }, appConfig.secret);

    return user.save().then(function () {
      return user;
    })
  });
};


module.exports = {
  validate: validate,
  create: create,
  update: update,
  login: login
};