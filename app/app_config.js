var events = require('events');
var fs = require('fs-extra-promise');

var logger = require('./utils/logger');

var config = {
  emitter: new events.EventEmitter(),
  secret: "G@n4z-B4ck3nd",
  dbUrl: 'mongodb://localhost/ganaz',
  root: '/',
  port: 8000
};

config.load = function () {
  var overrideFile = __dirname + '/app_config_overrides.json';
  fs.exists(overrideFile, function (exists) {
    if (exists) {
      logger.debug('Reading app_config_overrides.json');
      fs.readFileAsync(overrideFile, 'utf8').then(function (contents) {
        var json = JSON.parse(contents);
        var updateConfig = function (properties) {
          properties.forEach(function (property, index) {
            if (property in json) {
              config[property] = json[property]
            }
          });
        };
        updateConfig(['root', 'port', 'dbUrl', 'secret']); // TODO: Make this dynamic
        config.emitter.emit('ready');
      }, function (error) {
        logger.warn('Error reading ' + overrideFile + '. Error: ' + error.message);
        config.emitter.emit('ready');
      });
    } else {
      logger.info('Using default configurations since ' + overrideFile + ' does not exists.');
      config.emitter.emit('ready');
    }
  });

};
module.exports = config;