var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var PaySchema = new Schema({
    rate: {
        type: String
    },
    unit: {
        type: String
    }
});

var DatesSchema = new Schema({
    from: {
        type: Date
    },
    to: {
        type: Date
    }
});

var BenefitsSchema = new Schema({
    training: {
        type: Boolean
    },
    health_checks: {
        type: Boolean
    },
    housing: {
        type: Boolean
    },
    transportation: {
        type: Boolean
    },
    bonus: {
        type: Boolean
    },
    scholarships: {
        type: Boolean
    }
});

var LocationSchema = new Schema({  
    address: String,
    loc: {
        type: [Number],  // [<longitude>, <latitude>]
        index: '2d'      // create the geospatial index
    }
});

var JobSchema = new Schema({
	company_id: {
		type: String,
		required: true
	},
    company_user_id: String,
	title: {
		en: String,
        es: String
	},
    pay: {
        type: PaySchema,
        required: true
    },
    dates: {
        type: DatesSchema,
        required: true
    },
    field_condition: String,
    positions_available: {
        type: Number
    },
    benefits: {
        type: BenefitsSchema
    },
    locations: [ LocationSchema ],
    comments: {
        en: String,
        es: String
    },
    auto_translate: {
        type: Boolean
    },
    created_at: Date,
    status: String
});

// JobSchema.pre('save', function(next) {
//     var job = this;
//     if (this.isModified('locations') || this.isNew) {
//         job.locations.forEach(function(location) {
//             job.locations[job.locations.indexOf(location)].loc = [location.lng, location.lat];
//         });
//         next();
//     } else {
//         return next();
//     }
// });

JobSchema.pre('save', function (next) {
  if (!this.created_at) {
    this.created_at = Date.now();
  }
  if (!this.status) {
    this.status = 'activated';
  }
  next();
});

JobSchema.methods.setStatus = function(status) {
  if(status !== 'activated' && status !== 'deactivated') {
      throw new Error('Invalid job status [' + status + ']. Accepted statuses are [activated, deactivated]');
  }
  this.status = status;
};

JobSchema.statics.adaptLocation = function(data) {
    if (data.locations)
    {
        data.locations.forEach(function(location) {
            data.locations[data.locations.indexOf(location)].loc = [location.lng, location.lat];
        });
    }
    return data;
};

module.exports = mongoose.model('Job', JobSchema);