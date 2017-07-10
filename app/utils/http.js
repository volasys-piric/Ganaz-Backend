const logger = require('./logger');
module.exports = {
  handleError: function (res) {
    return function (error) {
      let message = '';
      if (error instanceof Error) {
        logger.error(error);
        message = error.message;
      } else {
        logger.warn(error);
        message = error;
      }
      res.json({
        success: false,
        msg: message
      });
    }
  }
};