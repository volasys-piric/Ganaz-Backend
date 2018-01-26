const logger = require('./logger');
module.exports = {
  handleError: (res) => {
    return (error) => {
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