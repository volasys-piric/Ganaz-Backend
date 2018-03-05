const Promise = require('bluebird');
const rp = require('request-promise');
const appConfig = require('./../../../app_config');
const logger = require('./../../../utils/logger');
module.exports = {
  translate: (text, sourceLang, targetLang) => {
    if (!sourceLang) {
      sourceLang = 'es';
    }
    if (!targetLang) {
      targetLang = 'en';
    }
    const url = `https://translation.googleapis.com/language/translate/v2?key=${appConfig.GOOGLE_TRANSLATE_KEY}&source=${sourceLang}&target=${targetLang}&q=${text}`;
    logger.info(`[Google Service] Calling google translate using url ${url}`);
    return rp.get(url, {json: true}).then(function(responseBody) {
      /* Sample success response body
        {
          "data": {
            "translations": [
              {
                "translatedText": "Please"
              }
            ]
          }
        }
        Sample error response body
        {
          "error": {
            "code": 400,
            "message": "API key not valid. Please pass a valid API key.",
            "errors": [
              {
                "message": "API key not valid. Please pass a valid API key.",
                "domain": "global",
                "reason": "badRequest"
              }
            ],
            "status": "INVALID_ARGUMENT"
          }
          or
          {
            "error": {
              "code": 400,
              "message": "Invalid Value",
              "errors": [
                {
                  "message": "Invalid Value",
                  "domain": "global",
                  "reason": "invalid"
                }
              ]
            }
          }
        }
     */
      if (responseBody.data) {
        return responseBody.data.translations.map(o => o.translatedText);
      } else {
        logger.error(`[Google Service] Error response body of ${url} is ${JSON.stringify(responseBody)}`);
        return Promise.reject(responseBody.error.message);
      }
    });
  }
};