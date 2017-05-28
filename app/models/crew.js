var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var CrewSchema = new Schema({
    company_id: String,
    title: String
});

module.exports = mongoose.model('Crew', CrewSchema);