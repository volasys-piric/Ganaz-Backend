'use strict';
const bcrypt = require('bcrypt-nodejs');
module.exports = {
  up(db, next) {
    db.collection('admins').insert({
      username: 'ganazapp@yandex.com',
      password: bcrypt.hashSync('admin')
    });
    next();
  },
  down(db, next) {
    db.collection('admin').remove({username: 'ganazapp@yandex.com'});
    next();
  }
};