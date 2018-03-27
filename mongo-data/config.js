'use strict';
const appConfig = require('./../app/app_config');
// In this file you can configure migrate-mongo
const dbUrl = appConfig.dbUrl;
const idx = dbUrl.lastIndexOf('/');
const url = dbUrl.substring(0, idx);
const databaseName = dbUrl.substring( idx + 1);
module.exports = {
  mongodb: {
    url:url,
    databaseName: databaseName,
    // uncomment and edit to specify Mongo client connect options (eg. increase the timeouts)
    // see https://mongodb.github.io/node-mongodb-native/2.2/api/MongoClient.html
    //
    // options: {
    //   connectTimeoutMS: 3600000, // 1 hour
    //   socketTimeoutMS: 3600000, // 1 hour
    // }
  },
  // The migrations dir, can be an relative or absolute path. Only edit this when really necessary.
  migrationsDir: 'migrations',
  // The mongodb collection where the applied changes are stored. Only edit this when really necessary.
  changelogCollectionName: 'changelog',

};