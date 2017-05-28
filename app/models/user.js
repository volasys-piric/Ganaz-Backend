var mongoose = require('mongoose');
var Schema = mongoose.Schema;
var bcrypt = require('bcrypt-nodejs');

var PhoneNumberSchema = new Schema({
    country: {
        type: String
    },
    country_code: {
        type: String
    },
    local_number: {
        type: String
    }
});

var AddressSchema = new Schema({
    address1: {
        type: String
    },
    address2: {
        type: String
    },
    city: {
        type: String
    },
    state: {
        type: String
    },
    country: {
        type: String
    }
});

var CompanySchema = new Schema({
    // name: {
    //     type: String
    // },
    // name_translated: {
    //     type: String
    // },
    // address: {
    //     type: AddressSchema
    // },
    // description: {
    //     type: String
    // },
    // description_translated: {
    //     type: String
    // },
    // auto_translate: {
    //     type: Boolean
    // }
    company_id: String
});

// var LocationSchema = new Schema({
//     lat: {
//         type: Number
//     },
//     lng: {
//         type: Number
//     },
//     address: {
//         type: String
//     }
// });

var LocationSchema = new Schema({  
    address: String,
    loc: {
        type: [Number],  // [<longitude>, <latitude>]
        index: '2d'      // create the geospatial index
    }
});

// LocationSchema.pre('save', function(next) {
//     var location = this;
//     if (this.isModified("lat") || this.isModified("lng") || this.isNew) {
//         location.loc = [location.lat, location.lng];
//         next();
//     } else {
//         return next();
//     }
// });

var WorkerSchema = new Schema({
    location: {
        type: LocationSchema
    },
    is_newjob_lock: {
        type: Boolean,
        default: false
    },
});

var UserSchema = new Schema({
	username: {
		type: String,
		required: true,
        unique: true
	},
	password: {
		type: String
	},
    firstname: {
        type: String
    },
    lastname: {
        type: String
    },
    email_address: {
        type: String
    },
    type: {
        type: String,
        required: true
    },
    phone_number: {
        type: PhoneNumberSchema
    },
    company: {
        type: CompanySchema
    },
    worker: {
        type: WorkerSchema
    },
    auth_type: {
        type: String
    },
    external_id: {
        type: String
    },
    player_ids: [String],
    last_login: {
        type: Date
    },
    created_at: {
        type: Date
    }
});

UserSchema.pre('save', function(next) {
	var user = this;
	if (this.isModified('password') || this.isNew) {
		bcrypt.genSalt(10, function(err, salt) {
			if (err) {
				return next(err);
			}
			bcrypt.hash(user.password, salt, null, function(err, hash) {
				if (err) {
					return next(err);
				}
				user.password = hash;
				next();
			});
		});
	} else {
		return next();
	}
});

UserSchema.pre('findOneAndUpdate', function(next) {
    var query = this;
    var password = this.getUpdate().$set.password;

    if (password) {
        bcrypt.genSalt(10, function(err, salt) {
            if (err) {
                return next(err);
            }
            bcrypt.hash(password, salt, null, function(err, hash) {
                if (err) {
                    return next(err);
                }
                query.findOneAndUpdate({}, { password: hash });
                next();
            });
        });
    } else {
        return next();
    }
});

UserSchema.methods.comparePassword = function(passw, cb) {
	bcrypt.compare(passw, this.password, function(err, isMatch) {
		if (err) {
			return cb(err);
		}
		cb(null, isMatch);
	});
};

UserSchema.statics.adaptLocation = function(data) {
    if (data.worker && data.worker.location)
    {
        data.worker.location.loc = [data.worker.location.lng, data.worker.location.lat];
    }
    return data;
}

module.exports = mongoose.model('User', UserSchema);