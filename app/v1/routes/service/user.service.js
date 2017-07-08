var Promise = require('bluebird');
var bcrypt = require('bcrypt-nodejs');
var jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens

var db = require('./../../db');
var appConfig = require('./../../../app_config');
var companyService = require('./company.service');

var User = db.models.user;

var create = function (body) {
  var findPromises = [User.findOne({username: body.username})];
  if (body.auth_type === 'email') {
    findPromises.push(User.findOne({email_address: body.email_address}))
  } else {
    findPromises.push(Promise.resolve(null));
  }
  return Promise.all(findPromises).then(function (findPromises) {
    var existingUser = findPromises[0];
    var existingEmail = findPromises[1];
    if (existingUser) {
      return Promise.reject('User with username ' + body.username + ' already exists.');
    } else if (existingEmail) {
      return Promise.reject('User with email ' + body.email_address + ' already exists.');
    } else {
      var user = new User(User.adaptLocation(body));
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

var update = function (id, body) {
  User.findById(id).then(function (userModel) {
    var user = Object.assign(userModel, User.adaptLocation(body));
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

var login = function (body) {
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
  create: create,
  update: update,
  login: login
};