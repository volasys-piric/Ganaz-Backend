const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken'); // used to create, sign, and verify tokens
const bcrypt = require('bcrypt-nodejs');
const db = require('./../../db');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');

const Admin = db.models.admin;

router.post('/login', function (req, res) {
  // find the user
  const username = req.body.username;
  Admin.findOne({username: username}).then(function (model) {
    if (!model) {
      res.json({success: false, message: 'Authentication failed. User not found.'});
    } else {
      // check if password matches
      if (req.body.password !== model.password && // Ganaz-Admin may pass encrypted password
        !bcrypt.compareSync(req.body.password, model.password)) {
        res.json({success: false, message: 'Authentication failed. Wrong password.'});
      } else {
        // if user is found and password is right
        // create a token
        const user = model.toJSON();
        user.admin = true;
        user.password = undefined;
        delete user.password;
        const token = jwt.sign(user, appConfig.secret, {
          expiresIn: '1d' // expires in 1 day. See https://github.com/auth0/node-jsonwebtoken#user-content-usage for possible values
        });
        // return the information including token as JSON
        res.json({
          success: true,
          message: 'Don\'t loose the token!',
          token: 'Bearer ' + token
        });
      }
    }
  }, function (error) {
    logger.error(error);
    res.status(500).send({message: "Internal Error in getting companies"});
  });
});

module.exports = router;