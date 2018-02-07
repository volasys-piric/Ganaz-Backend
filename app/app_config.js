const os = require('os');
const events = require('events');
const fs = require('fs-extra-promise');

const logger = require('./utils/logger');

const config = {
  emitter: new events.EventEmitter(),
  version: 1.9,
  secret: "G@n4z-B4ck3nd",
  dbUrl: 'mongodb://localhost/ganaz',
  root: '/',
  port: 8000,
  appstore_url: 'https://itunes.apple.com/app/id1230180278',
  TWILIO_ACCOUNT_SID: 'ACbd8003709f13c4f1786be1ad41593e4e',
  TWILIO_AUTH_TOKEN: '3319f902715d78fd3df0a14f2e62b259',
  TWILIO_PHONE_NUMBER: '+1 510-694-2629',
  support_mail: 'super.savych@yandex.com',
  STRIPE_SECRET_KEY: 'sk_test_RhXr4017wVdvnotlxgtS9gOq',
  STRIPE_PUBLISHABLE_KEY: 'pk_test_JZqzrp7oWZSWPvfhZHoGvWH3',
  ONE_SIGNAL_API_KEY: 'NmNmZTQyNDItNWI3Yy00M2I1LWEwNWMtY2RiMTkwNTQ3MWY2',
  ONE_SIGNAL_API_ID: 'ade7e4b5-b439-4d82-9bb2-c040372c1f14',
  FB_VERIFY_TOKEN: 'G@n4zF@c3b00kTok3n!@#',
  FB_PAGE_ACCESS_TOKEN: 'EAAEuoIpV9lQBAFwG9yFigq9hpbNwUMgFryrRZBHSMdZBZBLRub45EMUy2v5bFXxyn52WNpHzF3zNyDwQLO3ZB0UHDfAiLtCSrlw8aBmDrg2O7SZBQvkqB04aaNboZC0GI0EJKH1j6VdZBPPLG9wuXuNeD6NEpbtyuCwDYvSC2sZAOLTrwKpODAS6',
};

config.load = function () {
  const overrideFile = __dirname + '/app_config_overrides.json';
  fs.exists(overrideFile, function (exists) {
    if (exists) {
      logger.info('Reading app_config_overrides.json');
      fs.readFileAsync(overrideFile, 'utf8').then(function (contents) {
        const json = JSON.parse(contents);
        const updateConfig = function (properties) {
          properties.forEach(function (property, index) {
            if (property in json) {
              logger.info('Overriding Config Name: ' + property +
                ', Default Value: ' + config[property] +
                ', New Value: ' + json[property]);
              config[property] = json[property]
            }
          });
        };
        // TODO: Make this dynamic
        updateConfig(['secret', 'dbUrl', 'root', 'port', 'appstore_url',
          'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER', 'support_mail',
          'STRIPE_SECRET_KEY', 'STRIPE_PUBLISHABLE_KEY', 'ONE_SIGNAL_API_KEY', 'ONE_SIGNAL_API_ID',
          'FB_VERIFY_TOKEN', 'FB_PAGE_ACCESS_TOKEN']);
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