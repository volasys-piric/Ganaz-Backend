const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const DynamicSchema = new Schema({_id: false}, {strict: false});

module.exports = DynamicSchema;