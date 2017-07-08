// See http://tostring.it/2014/06/23/advanced-logging-with-nodejs/
var winston = require('winston');
winston.emitErrs = true;

var isProduction = process.env.NODE_ENV === 'production';
var transports = [
  new winston.transports.File({
    level: 'info',
    filename: isProduction ? './logs/prod.log' : './logs/dev.log',
    handleExceptions: true,
    json: true,
    maxsize: 5242880, //5MB
    maxFiles: 5,
    colorize: false
  })
];
if (!isProduction) {
  transports.push(new winston.transports.Console({
    level: 'debug',
    handleExceptions: true,
    json: false,
    colorize: true
  }));
}

var logger = new winston.Logger({
  transports: transports,
  exitOnError: false
});

module.exports = logger;
module.exports.stream = {
  write: function(message, encoding) {
    logger.info(message);
  }
};