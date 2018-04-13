const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PhoneNumberSchema = new Schema({
  country: String,              // US / MX / ...
  country_code: String,         // 1 / 52 / ...
  local_number: String
});

const InviteSchema = new Schema({
  created_at: Date,
  // ============== Deprecated since v1.12 =============== //
  user_id: {$type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  company_id: String,
  phone_number: {
    $type: PhoneNumberSchema,
    required: true
  },
  // ============ Supported from v1.12 ================ //
  sender: {
    company_id: {$type: mongoose.Schema.Types.ObjectId, ref: 'Company'},
    user_id: {$type: mongoose.Schema.Types.ObjectId, ref: 'User'},
  },
  receiver: {
    type: {$type: String, enum: ['worker', 'company-group-leader']},
    worker: {                                        // Optional
      phone_number: {$type: PhoneNumberSchema}
    },
    company_group_leader: {                         // Optional
      phone_number: {$type: PhoneNumberSchema},
      crews: [{$type: mongoose.Schema.Types.ObjectId, ref: 'Crew'}]
    }
  },
}, {typeKey: '$type'});

InviteSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  next();
});

module.exports = mongoose.model('Invite', InviteSchema);
