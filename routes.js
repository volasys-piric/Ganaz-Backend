import User from './app/models/user';
import Job from './app/models/job';
import Message from './app/models/message';
import Application from './app/models/application';
import Review from './app/models/review';
import MyWorker from './app/models/myworker';
import Recruit from './app/models/recruit';
import Invite from './app/models/invite';
import Company from './app/models/company';
import {PaymentMethod, PaymentHistory} from './app/models/payments';
import Crew from './app/models/crew';
import Membership from './app/models/membership';
import config from './config/database';
import config_stripe from './config/stripe';
import jwt from 'jwt-simple';
import twilio from 'twilio';
import stripe from 'stripe';
import express from 'express';
import async from 'async';
import pushNotification from './app/push_notification';
import _ from 'underscore';
import request from 'request';
import mongoose from 'mongoose';
import sendmail from 'sendmail';
import inviteRoutes from './routes/invite';
import recruitRoutes from './routes/recruit';
import headerChecker from './middlewares/headerChecker';

let router = express.Router();
let twilio_client = twilio(config.TWILIO_ACCOUNT_SID, config.TWILIO_AUTH_TOKEN);
let stripe_client = stripe(config_stripe.test.secret_key);
let sendmail_client = sendmail();

let constDegreeInMiles = 1.609 / 111.12; // 1 mile = 1.609km, One degree (earth) = 111.12 km

module.exports = function(app, passport) {
    router.get('/', function(req, res) {
        res.send('Hello! The API is now working');
    });

    router.post('/user/login', function(req, res) {
        User.findOne({
            username: req.body.username
        }, function(err, user) {
            if (err) { return res.json({ success: false, err: err }); }

            if (!user) {
                res.send({ success: false, msg: 'Authentication failed. User not found.'});
            } else {
                if (req.body.auth_type === 'email') {
                    user.comparePassword(req.body.password, function(err, isMatch) {
                        if (isMatch && !err) {
                            let token = jwt.encode(user, config.secret);
                            let user_json = user.toJSON();
                            user_json.access_token = 'Bearer ' + token;

                            attachCompanyDataToUserJson(user_json)
                                .then(user_json => {
                                    res.json({ success: true, account: user_json });
                                })
                                .catch(err => {
                                    res.json({ success: false, err: err });
                                });

                            // calculateReviewScore(user._id.toString()).then(({total_score, total_review}) => {
                            //     if (total_review && user_json.company)
                            //     {
                            //         user_json.company.total_score = total_score;
                            //         user_json.company.total_review = total_review;
                            //     }
                            //     res.json({ success: true, account: user_json });
                            // });

                            user.last_login = new Date();
                            user.save(function(err) {
                                if (err) {
                                    console.log("Couldn't update user last login info!!", err);
                                }
                            });
                        } else {
                            res.send({ success: false, msg: 'Authentication failed. Wrong password.' });
                        }
                    });
                }
            }
        });
    });

    router.route('/user/search/phones', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            User.aggregate(
                [   
                    { "$redact": { 
                        "$cond": [ 
                            {
                                "$or": [
                                    {
                                        "$setIsSubset": [
                                            [
                                                { "$substr": [ "$phone_number.local_number", 0, -1 ] }
                                            ],
                                            req.body.phone_numbers
                                        ]
                                    },
                                    {
                                        "$setIsSubset": [
                                            [
                                                { 
                                                    "$concat": [ 
                                                        { "$substr": [ "$phone_number.country_code", 0, -1 ] },
                                                        { "$substr": [ "$phone_number.local_number", 0, -1 ] }
                                                    ] 
                                                }
                                            ],
                                            req.body.phone_numbers
                                        ]
                                    }
                                ]
                                
                            },
                            "$$KEEP",
                            "$$PRUNE"
                        ]
                    }}
                ],
                function(err, users) {
                    // Do something
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    res.json({ success: true, users: users });
                }
            )
        });

    router.route('/user/search', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            let condAnd = [];
            if (req.body.type) {
                condAnd.push({"type": req.body.type});
            }
            if (req.body.phone_number){
                condAnd.push({"phone_number.local_number": req.body.phone_number});
            }

            let conditions = {"$and": condAnd};

            User.find(conditions, function(err, users) {
                    
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    let asyncTasks = [];
                    let users_json_array = [];
                    users.forEach(function(user){
                        asyncTasks.push(function(parallel_callback) {
                            calculateReviewScore(user._id.toString()).then(({total_score, total_review}) => {
                                if (total_review && user.company)
                                {
                                    user.company.total_score = total_score;
                                    user.company.total_review = total_review;
                                }
                                users_json_array.push(user);
                                parallel_callback();
                            });
                        });
                    });

                    async.parallel(asyncTasks, function(err, results) {
                        res.json({
                            success: true, users: users_json_array
                        });
                    });
                }
            );

            /*
            let conditions = [
                { 
                    "$match": {
                        "type": req.body.type,
                        "email_address": new RegExp((req.body.email_address || req.body.any || '').toLowerCase(), "i"),
                        "firstname": new RegExp((req.body.firstname || req.body.any || '').toLowerCase(), "i") ,
                        "lastname": new RegExp((req.body.lastname || req.body.any || '').toLowerCase(), "i") 
                    }
                }
            ];
            if (req.body.phone_number || req.body.any) {
                conditions.push({
                    "$redact": {
                        "$cond": [
                            {
                                "$or": [
                                    {
                                        "$setIsSubset": [
                                            [ { "$substr": [ "$phone_number.local_number", 0, -1 ] } ],
                                            [req.body.phone_number, req.body.any]
                                        ]
                                    },
                                    {
                                        "$setIsSubset": [
                                            [
                                                { 
                                                    "$concat": [ 
                                                        { "$substr": [ "$phone_number.country_code", 0, -1 ] },
                                                        { "$substr": [ "$phone_number.local_number", 0, -1 ] }
                                                    ] 
                                                }
                                            ],
                                            [req.body.phone_number, req.body.any]
                                        ]
                                    }            
                                ]

                            },
                            "$$KEEP",
                            "$$PRUNE"
                        ]
                    }
                });
            }
            User.aggregate(conditions, function(err, users) {
                    
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    let asyncTasks = [];
                    let users_json_array = [];
                    users.forEach(function(user){
                        asyncTasks.push(function(parallel_callback) {
                            calculateReviewScore(user._id.toString()).then(({total_score, total_review}) => {
                                if (total_review && user.company)
                                {
                                    user.company.total_score = total_score;
                                    user.company.total_review = total_review;
                                }
                                users_json_array.push(user);
                                parallel_callback();
                            });
                        });
                    });

                    async.parallel(asyncTasks, function(err, results) {
                        res.json({
                            success: true, users: users_json_array, original_users: users, status: 'debugging'
                        });
                    });
                }
            );
*/
        });

    router.route('/user') // sign up
        .post(function(req, res) {
            if(!isValidUserInfo(req.body)) {
                res.json({ success: false, msg: 'Please recheck if omitted things exist.'});
            } else {
                let newUser = new User(User.adaptLocation(req.body));
                newUser.last_login = new Date();
                newUser.created_at = new Date();

                Invite.findOne({
                    'phone_number.country': newUser.phone_number.country,
                    'phone_number.country_code': newUser.phone_number.country_code,
                    'phone_number.local_number': newUser.phone_number.local_number
                }, function(err, invite) {
                    if (err) {
                        console.error(err);
                    } else if (invite) {
                        newUser.worker = newUser.worker || {};
                        newUser.worker.is_newjob_lock = true;
                    }
                    newUser.save(function(err) {
                        if (err) {
                            let msg = "";
                            if (/email_address/g.test(err.errmsg)) {
                                msg = "Email Address Duplicated";
                            } else if (/username/g.test(err.errmsg)) {
                                msg = "Username Duplicated";
                            } else if(typeof err === 'string') {
                                msg = err
                            } else {
                                msg = err.message;
                            }
                            return res.json({success: false, msg: msg});
                        }
                        let token = jwt.encode(newUser, config.secret);
                        let user_json = newUser.toJSON();
                        user_json.access_token = 'Bearer ' + token;
                        // if (user_json.company && user_json.company.company_id) {
                        //     Company.findById(user_json.company.company_id, function(err, company) {
                        //         if (err) {
                        //             return res.json({ success: false, err: err, msg: 'Cannot find company.' });
                        //         }
                        //         user_json.company.account = company;
                        //         res.json({ success: true, account: user_json, msg: 'Successfully created new user.'});
                        //     });
                        // } else {
                        //     res.json({success: true, msg: 'Successfully created new user.', account: user_json});
                        // }
                        attachCompanyDataToUserJson(user_json)
                            .then(user_json => {
                                res.json({ success: true, account: user_json });
                            })
                            .catch(err => {
                                res.json({ success: false, err: err });
                            });

                        if (invite) { // Send Message to company which invited the worker
                            Company.findById(invite.company_id, function(err, company) {
                                if (err) {
                                    console.error(err);
                                } else {
                                    /*
                                    let request_body = JSON.stringify({
                                        'job_id': 'NONE',
                                        'type': 'register-from-invitation',
                                        'sender': {
                                            'user_id': newUser._id.toString(),
                                            'company_id': ''
                                        },
                                        'receivers': [{
                                            'user_id': '',      // Should be updated...
                                            'company_id': company._id.toString()
                                        }],
                                        'message': ` Hello ${company.name.en}, ${newUser.username} is registered as your worker.`,
                                        'auto_tranlate': false,
                                        'datetime': new Date()
                                    });

                                    let headers = {
                                        'Content-Length': Buffer.byteLength(request_body),
                                        'authorization': req.headers.authorization,
                                        'content-type': 'application/json'
                                    };
                                    
                                    request.post({
                                        url: config.site_url + '/message',
                                        headers: headers,
                                        body: request_body
                                    }, function(error, response, body) {
                                        if (!error) {
                                            console.log(body);
                                        } else {
                                            console.error('Error:', error);
                                        }
                                        // res.end( );
                                    });
                                    */

                                    // MyWorker
                                    let newMyWorker = new MyWorker({
                                        company_id: company._id.toString(),
                                        worker_user_id: newUser._id.toString(),
                                        crew_id: ''
                                    });
                                    newMyWorker.save(function(err) {
                                        if (err) {
                                            console.error('Error:', err);
                                        }
                                    });

                                    // Delete Invite
                                    Invite.findByIdAndRemove(invite._id, function(err, _invite) {
                                        if (err) {
                                            console.error(err);
                                        } else {
                                            console.log('invite deleted');
                                        }
                                    });
                                }
                            });
                        }
                    });
                });
            }
        })
        .patch(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);

                User.findOneAndUpdate({ 
                    _id: decoded._id
                }, { $set: User.adaptLocation(req.body.account) }, { new: true }, function(err, user) {
                    if (err) { return res.json({ success: false, err: err }); }

                    if (!user) {
                        return res.status(403).send({ success: false, msg: 'Cannot get user info.' });
                    } else {
                        res.json({success: true, msg: 'Successfully updated user info.', account: user});
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });    

    router.route('/user/password_recovery/pin')
        .post(function(req, res) {
            User.findOne({
                username: req.body.username
            }, function(err, user) {
                if (err) {
                  var msg = null;
                  if (typeof err === 'string') {
                    msg = err
                  } else {
                    msg = err.message;
                  }
                  return res.json({success: false, msg: msg});
                }
                let pin = generate_pin_code();
                let access_token = 'Bearer ' + jwt.encode(user, config.secret);
                res.json({
                    success: true,
                    recovery: {
                        pin,
                        access_token
                    }
                });

                twilio_client.messages.create({
                    from: config.TWILIO_PHONE_NUMBER,
                    to: "+" + user.phone_number.country_code + user.phone_number.local_number,
                    body: `Ganaz Pin Code: ${pin}`
                }, function(err, message) {
                    if (err) {
                        console.error(err.message);
                    } else {
                        console.log(message);
                    }
                });
            });
        });
    
    router.route('/user/password_recovery/reset', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            debugger;
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                User.findOneAndUpdate({
                    _id: decoded._id
                }, { $set: req.body }, { new: true }, function(err, user) {
                    if (err) { return res.json({ success: false, err: err }); }
                    if (!user) {
                        return res.status(403).send({ success: false, msg: 'Cannot get user info.' });
                    } else {
                        res.json({success: true, msg: 'Successfully updated user password.', account: user});
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/user/:user_id')
        .get(function(req, res) {
            // let token = getToken(req.headers);
            // if (token) {
                // let decoded = jwt.decode(token, config.secret);
                User.findById(req.params.user_id, function(err, user) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }

                    if (!user) {
                        return res.status(403).send({ success: false, msg: 'User not found.' });
                    } else {
                        let user_json = user.toJSON();
                        calculateReviewScore(user._id.toString()).then(({total_score, total_review}) => {
                            if (total_review && user_json.company)
                            {
                                user_json.company.total_score = total_score;
                                user_json.company.total_review = total_review;
                            }
                            res.json({ success: true, account: user_json });
                        });
                    }
                });
            // } else {
            //     return res.status(403).send({success: false, msg: 'No token provided.'});
            // }
        });
        // .patch(function(req, res) {
        //     let token = getToken(req.headers);
        //     if (token) {
        //         let decoded = jwt.decode(token, config.secret);

        //         User.findOneAndUpdate({ username: decoded.username }, { $set: User.adaptLocation(req.body) }, { new: true }, function(err, user) {
        //             if (err) {
        //                 return res.json({ success: false, err: err });
        //             }

        //             if (!user) {
        //                 return res.status(403).send({ success: false, msg: 'Authentication failed. User not found.' });
        //             } else {
        //                 res.json({success: true, msg: 'Successfully updated user info.', account: user});
        //             }
        //         });
        //     } else {
        //         return res.status(403).send({success: false, msg: 'No token provided.'});
        //     }
        // });

    router.route('/user/:user_id/type', passport.authenticate('jwt', {session: false}))
        .patch(function(req, res) {
            debugger;
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                let asyncTasks = {};
                asyncTasks.admin_user = (parallel_callback) => {
                    User.findById(decoded._id, function(err, admin_user) {
                        if (err) {
                            return parallel_callback(err);
                        }
                        parallel_callback(null, admin_user);
                    });
                };
                asyncTasks.user = (parallel_callback) => {
                    User.findById(req.params.user_id, function(err, user) {
                        if (err) {
                            return parallel_callback(err);
                        }
                        parallel_callback(null, user);
                    });
                };
                async.parallel(asyncTasks, function(err, results) {
                    if (err) {
                        return res.json({success: false, msg: 'Cannot update company user role', err: err});
                    }
                    if (!results.admin_user.company || !results.user.company || (results.admin_user.type != 'company-admin') ||(results.admin_user.company.company_id != results.user.company.company_id)) {
                        return res.json({success: false, msg: 'You have no privilege to update the user company role'});
                    }
                    results.user.type = req.body.type;
                    results.user.save(function(err) {
                        if (err) {
                            return res.json({success: false, msg: 'Cannot update company user role', err: err});
                        }
                        res.json({
                            success: true,
                            msg: 'User company role updated.'
                        });
                    });
                });
                
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/company')
        .post(function(req, res) {
            stripe_client.customers.create({
                description: `Customer for ${req.body.name.en}`
            }, function(err, customer) {
                req.body.payment_stripe_customer_id = customer.id;
                let newCompany = new Company(req.body);
                newCompany.save(function(err) {
                    if (err) {
                        return res.json({success: false, err: err});
                    }
                    
                    let company_json = newCompany.toJSON();
                    company_json.review_stats = {
                        total_reviews: 0,
                        total_score: 0
                    };
                    company_json.activity_stats = {
                        total_jobs: 0,
                        total_recruits: 0,
                        total_messages_sent: 0
                    };

                    return res.json({
                        success: true,
                        company: company_json
                    });
                });
            });
        });

    router.route('/company/:company_id')
        .get(function(req, res) {
            Company.findById(req.params.company_id, function(err, company) {
                if (err) {
                    return res.json({ success: false, err: err });
                }
                calculateStatsOfCompany(company._id.toString()).then(({review_stats, activity_stats}) => {
                    let company_json = company.toJSON();
                    company_json.review_stats = review_stats;
                    company_json.activity_stats = activity_stats;

                    res.json({ success: true, company: company_json});
                });
            });
        });

    router.route('/company/search')
        .post(function(req, res) {
            Company.find({
                // "code": { "$regex": req.body.code, "$options": "i" }
                "code": req.body.code
            }, function(err, companies) {
                if (err) {
                    return res.json({ success: false, err: err });
                }
                res.json({ success: true, companies: companies });
            });
        });

    router.route('/company/:company_id/profile', passport.authenticate('jwt', {session: false}))
        .patch(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                Company.findOneAndUpdate({
                    _id: req.params.company_id
                }, { $set: req.body }, { new: true }, function(err, company) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }

                    if (!company) {
                        return res.status(403).send({ success: false, msg: 'Cannot update such a company' });
                    } else {
                        res.json({ success: true, msg: 'Successfully updated company info.', company: company });
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });
    
    router.route('/company/:company_id/plan', passport.authenticate('jwt', {session: false}))
        .patch(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                Company.findOneAndUpdate({
                    _id: req.params.company_id
                }, { $set: {plan: req.body.plan} }, { new: true }, function(err, company) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }

                    if (!company) {
                        return res.status(403).send({ success: false, msg: 'Cannot update such a company' });
                    } else {
                        res.json({ success: true, msg: 'Successfully updated company info.', company: company });
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/company/:company_id/payment_methods', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            debugger;
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);

                Company.findById(req.params.company_id, function(err, company) {
                    stripe.customers.createSource(
                        company.payment_stripe_customer_id,
                        { source: req.body.stripe_token },
                        function(err, card) {
                            if (err) {
                                return res.json({ success: false, msg: 'cannot create card object on stripe'});
                            }
                            req.body.stripe_card = card;
                            req.body.company_id = req.params.company_id;
                            let newPaymentMethod = new PaymentMethod(req.body);
                            newPaymentMethod.save(function(err) {
                                if (err) {
                                    return res.json({ success: false, msg: 'Cannot save payment method'});
                                }
                                res.json({ success: true, payment_method: newPaymentMethod });
                            });
                        }
                    );
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/company/:company_id/payment_methods/:payment_method_id', passport.authenticate('jwt', {session: false}))
        .delete(function(req, res) {
            debugger;
            let token = getToken(req.headers);
            if (token) {
                PaymentMethod.findOneAndRemove({
                    _id: req.params.payment_method_id,
                    company_id: req.params.company_id
                }, function(err) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    res.json({ success: true, msg: 'Successfully payment method deleted.'});
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/company/:company_id/pay', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            debugger;
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decoded(token, config.secret);
                PaymentMethod.findById(req.body.payment_method_id, function(err, payment_method) {
                    stripe.charges.create({
                        amount: req.body.amount,
                        currency: req.body.currency,
                        source: payment_method.stripe_card.id,
                        description: `Charge for ${decoded.email_address}`
                    }, function(err, charge) {
                        if (err) {
                            return res.json({ success: false, msg: 'Cannot create pay charge'});
                        }
                        let newPaymentHistory = new PaymentHistory(card);
                        newPaymentHistory.save(function(err) {
                            if (err) {
                                return res.json({ success: false, msg: 'Cannot save payment history'});
                            }
                            res.json({ success: true, payment_history: newPaymentHistory });
                        });
                    });
                });
                
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/company/:company_id/crews', passport.authenticate('jwt', {session: false}))
        .get(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                Crew.find({
                    company_id: req.params.company_id
                }, function(err, crews) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    res.json({ success: true, crews: crews });
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        })
        .post(function(req, res) {
            let newCrew = new Crew({
                company_id: req.params.company_id,
                title: req.body.title
            });
            newCrew.save(function(err) {
                if (err) {
                    return res.json({ success: false, msg: 'Cannot create crew' });
                }
                res.json({ success: true, crew: newCrew });
            });
        });
    
    router.route('/company/:company_id/crews/:crew_id', passport.authenticate('jwt', {session: false}))
        .patch(function(req, res) {
            Crew.findOneAndUpdate({
                company_id: req.params.company_id,
                _id: req.params.crew_id
            }, { $set: req.body }, { new: true }, function(err, crew) {
                if (err) {
                    return res.json({ success: false, msg: 'Cannot update crew' });
                }
                res.json({ success: true, crew: crew });
            });
        })
        .delete(function(req, res) {
            Crew.findOneAndRemove({
                company_id: req.params.company_id,
                _id: req.params.crew_id
            }, function(err) {
                if (err) { return res.json({ success: false, msg: 'Cannot delete crew' }); }
                else {
                    res.json({success: true, msg: "Successfully crew deleted."});
                }
            });
        });

    router.route('/company/:company_id/my-workers', passport.authenticate('jwt', {session: false}))
        .get(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                MyWorker.find({
                    company_id: req.params.company_id
                }, function(err, workers) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }

                    let asyncTasks = [];
                    let workers_json_array = [];
                    workers.forEach(function (worker) {
                        asyncTasks.push(function (parallel_callback) {
                            User.findById(worker.worker_user_id, function(err, user) {
                                if (err) {
                                    return parallel_callback(err);
                                }
                                if(user) {
                                    workers_json_array[workers.indexOf(worker)] = Object.assign({}, { worker_account: user.toJSON() }, worker.toJSON());
                                }
                                parallel_callback();
                            });
                        });
                    });

                    async.parallel(asyncTasks, function(err, results) {
                        if (err) {
                            return res.json({success: false, err: err});
                        } else {
                            res.json({ success: true, my_workers: workers_json_array });
                        }
                    });
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        })
        .post(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                let asyncTasks = [];

                req.body.worker_user_ids.forEach(function(worker_user_id) {
                    asyncTasks.push(function(parallel_callback) {
                        let newMyWorker = new MyWorker({
                            company_id: req.params.company_id,
                            worker_user_id: worker_user_id,
                            crew_id: req.body.crew_id
                        });

                        newMyWorker.save(function(err) {
                            if (err) {
                                // return res.json({ success: false, err: err });
                                return parallel_callback(err);
                            }

                            User.findById(worker_user_id, function(err, user) {
                                if (err) {
                                    // return res.json({ success: false, err: err });
                                    parallel_callback(err);
                                }
                                let result_json = Object.assign({},  { worker_account: user.toJSON() }, newMyWorker.toJSON());

                                // res.json({ success: true, my_worker: result_json});
                                parallel_callback(null, result_json);
                            });
                        });
                    });
                });

                async.parallel(asyncTasks, function (err, results) {
                    if (err) {
                        return res.json({success: false, err: err});
                    }
                    res.json({success: true, added_workers: results});
                });
                
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/company/:company_id/my-workers/:my_worker_id', passport.authenticate('jwt', {session: false}))
        .delete(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                MyWorker.findOneAndRemove({
                    _id: req.params.my_worker_id,
                    company_id: req.params.company_id
                }, function(err) {
                    if (err) { return res.json({ success: false, err: err }); }
                    else {
                        res.json({success: true, msg: "Successfully worker deleted."});
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/job', passport.authenticate('jwt', {session: false}))
        .get(function(req, res) {
            let conditions = {
                status: 'activated'
            };
            if (req.query.company_id)
            {
                conditions.company_id = req.query.company_id;
            }
            if (req.query.location)
            {
                conditions["locations.loc"] = {
                        '$near': [Number(req.query.location.lng), Number(req.query.location.lat)],
                        '$maxDistance': 8047/6371 // consider earth radius
                };
            }
            if (req.query.status == "open")
            {
                conditions["dates.from"] = { $gt: new Date() };
            }
             
            Job.find(conditions, function(err, jobs) {
                if (err) {
                    return res.json({ success: false, err: err });
                }
                res.json({ success: true, jobs: jobs });
            });
        })
        .post(function(req, res) {
            let token = getToken(req.headers); 
            let newJob = new Job(Job.adaptLocation(req.body));
            newJob.save(function(err) {
                if (err) {
                    return res.json({success: false, msg: 'Job couldn\'t be created.'});
                }
                res.json({success: true, msg: 'Successfully created new job.', job: newJob});

                /* 
                 ** no message when create new job
                let asyncTasks = [];
                let near_users_array = [];
                newJob.locations.forEach(function(location, index) {
                    asyncTasks.push(function(parallel_callback) {
                        User.find({
                            'worker.location.loc': {
                                '$nearSphere': location.loc, 
                                '$maxDistance': 8047/6371
                            }
                        }, function(err, users) {
                            if (err) {
                                return parallel_callback(err);
                            }
                            near_users_array = near_users_array.concat(users);
                            parallel_callback();
                        });
                    });
                });

                async.parallel(asyncTasks, function(err, results) {
                    if (err) {
                        console.log('Cannot send push notification', err);
                    } else {
                        let receiver_ids = _.uniq(near_users_array, 'username').map(function(receiver) { return receiver._id.toString(); });
                        let request_body = JSON.stringify({
                            'job_id': newJob._id.toString(),
                            'type': 'job-new',
                            'sender_user_id': newJob.company_id,
                            'receivers': receiver_ids,
                            'message': 'New job is posted',
                            'auto_tranlate': true,
                            'datetime': new Date()
                        });

                        let headers = {
                            'Content-Length': Buffer.byteLength(request_body),
                            'authorization': req.headers.authorization,
                            'content-type': 'application/json'
                        };
                        
                        request.post({
                            url: config.site_url + '/message',
                            headers: headers,
                            body: request_body
                        }, function(error, response, body) {
                            if (!error) {
                                console.log(body);
                            } else {
                                console.error('Error:', error);
                            }
                            res.end( );
                        });
                        
                    }
                });
                */
            });
        });

    router.route('/job/search')
        .post(function(req, res) {
            // let token = getToken(req.headers);
            // if (token) {
                let conditions = {
                    status: 'activated'
                };
                if (req.body.company_id)
                {
                    conditions.company_id = req.body.company_id;
                }
                if (req.body.location && req.body.distance)
                {
                    conditions["locations.loc"] = {
                            '$near': [Number(req.body.location.lng), Number(req.body.location.lat)],
                            '$maxDistance': req.body.distance * constDegreeInMiles // consider earth radius
                    };
                }
                if (req.body.date)
                {
                    conditions["dates.from"] = { $lte: req.body.date };
                    conditions["dates.to"] = { $gte: req.body.date };
                }
                if (req.body.status == "open")
                {
                    conditions["dates.from"] = { $gt: new Date() };
                }
                
                Job.find(conditions, function(err, jobs) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    res.json({ success: true, jobs: jobs });
                });

            // } else {
            //     return res.status(403).send({success: false, msg: 'No token provided.'});
            // }
        });

    router.route('/job/:job_id', passport.authenticate('jwt', {session: false}))
        .get(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                Job.findOne({
                  _id: req.params.job_id,
                  status: 'activated'
                }, function(err, job) {
                    if (err) { return res.json({ success: false, err: err }); }

                    if (!job) {
                        return res.status(403).send({ success: false, msg: 'Cannot get such a job.' });
                    } else {
                        res.json({success: true, job: job});
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        })
        .patch(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                Job.findOneAndUpdate({ 
                    _id: req.params.job_id
                }, { $set: Job.adaptLocation(req.body) }, { new: true }, function(err, job) {
                    if (err) { return res.json({ success: false, err: err }); }

                    if (!job) {
                        return res.status(403).send({ success: false, msg: 'Cannot get such a job.' });
                    } else {
                        res.json({success: true, msg: 'Successfully updated job info.', job: job});
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        })
        .delete(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
              Job.findById(req.params.job_id).then(function (jobModel) {
                jobModel.setStatus('deactivated');
                return jobModel.save().then(function () {
                  res.json({success: true, msg: "Successfully job deleted."});
                });
              }).catch(function (err) {
                res.json({success: false, err: err});
              });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/message', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                req.body.datetime = new Date();
                req.body.status = "new";

                let asyncTasks = [];

                req.body.receivers.forEach(function(receiver) {

                    asyncTasks.push(function (parallel_callback) {
                        req.body.receiver = receiver;
                        let newMessage = new Message(req.body);

                        newMessage.save(function(err) {
                            if (err) {
                                return parallel_callback(err);
                            }
                        
                            let player_ids = [];
                            User.findById(newMessage.receiver.user_id, function(err, user) {
                                if (err) {
                                    console.log(err);
                                } else {
                                    const jsonMessage = newMessage.toJSON();
                                    let contents = null;
                                    if(typeof jsonMessage.message === 'object') {
                                        contents = jsonMessage.message
                                    } else {
                                        // Assumed to be string
                                        contents = {'en': jsonMessage.message}
                                    }
                                    let notification = {
                                        contents: contents,
                                        data: {
                                            type: jsonMessage.type,
                                            contents: {
                                                id: jsonMessage._id.toString()
                                            }
                                        }
                                    };

                                    if (jsonMessage.type == 'message') {
                                        notification.data.contents.message = newMessage.message;
                                    }
                                    if (jsonMessage.type == 'application') {
                                        notification.data.contents.job_id = req.body.application_id;
                                    }

                                    pushNotification.sendNotification(user.player_ids, notification);

                                    parallel_callback(null, jsonMessage);
                                }
                            });
                        });
                    });
                });

                async.parallel(asyncTasks, function (err, results) {
                    if (err) {
                        return res.json({success: false, err: err});
                    } else {
                        res.json({ success: true, messages: results});
                    }
                });

                
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/message/search', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            let final_condition, final_condition1 = {}, final_condition2 = {};
            if (req.body.user_id) {
                final_condition1 = Object.assign({}, {'sender.user_id': req.body.user_id}, final_condition1);
                final_condition2 = Object.assign({}, {'receiver.user_id': req.body.user_id}, final_condition2);
            }
            if (req.body.company_id) {
                final_condition1 = Object.assign({}, {'sender.company_id': req.body.company_id}, final_condition1);
                final_condition2 = Object.assign({}, {'receiver.company_id': req.body.company_id}, final_condition2);
            }
            final_condition = {
                $or: [final_condition1, final_condition2]
            };

            Message.find(final_condition, function(err, messages) {
                if (err)
                    throw err;
                else {
                    res.json({ success: true, messages: messages});
                }
            });
        });

    router.route('/message/:message_id/status', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            Message.findOneAndUpdate({
                _id: req.params.message_id
            }, { $set: {status: req.body.type}}, { new: true }, function(err, message) {
                if (err) {
                    return res.json({ success: false, err: err });
                }
                res.json({ success: true, message: message });
            });
        });

    router.route('/message/status-update', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let asyncTasks = [];
                let message_ids = req.body.message_ids;

                message_ids.forEach(function(message_id) {
                    asyncTasks.push(function (parallel_callback) {
                        Message.findOneAndUpdate({
                            _id: message_id
                        }, { $set: {status: req.body.status}}, { new: true }, function(err, message) {
                            if (err) {
                                return parallel_callback(err);
                            }
                            parallel_callback(null, message);
                        });
                    });
                });

                async.parallel(asyncTasks, function (err, results) {
                    if (err) {
                        return res.json({success: false, err: err});
                    } else {
                        res.json({ success: true, messages: results});
                    }
                });
            }
            else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/message/:message_id', passport.authenticate('jwt', {session: false}))
        .get(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                Message.findOne({
                    _id: req.params.message_id
                }, function(err, message) {
                    if (err) { return res.json({ success: false, err: err }); }

                    if (!message) {
                        return res.status(403).send({ success: false, msg: 'Cannot get such a job.' });
                    } else {
                        res.json({success: true, message: message});
                    }
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/application', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                let newApplication = new Application({
                    job_id: req.body.job_id,
                    worker_user_id: decoded._id
                });
                newApplication.save(function(err, application) {
                    if (err) {
                        return res.json({ success: false, msg: 'Application couldn\'t be created.' });
                    }
                    User.findById(decoded._id, function(err, user) {
                        if (err) {
                            return res.json({ success: false, err: err });
                        }
                        let application_json = application.toJSON();
                        application_json.user = user;
                        res.json({ success: true, application: application_json });

                        Job.findById(newApplication.job_id, function(err, job) {
                            if (err) {
                                console.error(err);
                            } else {
                                let receiver_condition = {
                                    'company.company_id': job.company_id,
                                    '$or': [
                                        {
                                            'type': 'company-regular'
                                        },
                                        {
                                            'type': 'company-admin'
                                        }
                                    ]
                                };

                                User.find(receiver_condition, function(err, users) {
                                    let receivers = users.map(function(user) {
                                        return {
                                            'user_id': user._id,
                                            'company_id': job.company_id
                                        };
                                    });

                                    let request_body = JSON.stringify({
                                        'application_id': newApplication._id,
                                        'job_id': job._id.toString(),
                                        'type': 'application',
                                        'sender': {
                                            'user_id': decoded._id,
                                            'company_id': ''
                                        },
                                        'receivers': receivers,
                                        'message': {
                                            'en': 'New job inquiry',
                                            'es': 'New job inquiry'
                                        },
                                        'auto_tranlate': 'false',
                                        'datetime': new Date()
                                    });

                                    let headers = {
                                        'Content-Length': Buffer.byteLength(request_body),
                                        'authorization': req.headers.authorization,
                                        'content-type': 'application/json',
                                        'version': req.header('version')
                                    };
                                    
                                    request.post({
                                        url: config.site_url + '/message',
                                        headers: headers,
                                        body: request_body
                                    }, function(error, response, body) {
                                        if (!error) {
                                            console.log(body);
                                        } else {
                                            console.error('Error:', error);
                                        }
                                        res.end( );
                                    });

                                });                                
                            }
                        });
                    });
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        })
        .get(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);

                Application.find({
                    'user_id': decoded._id.toString()
                }, function(err, applications) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    let asyncTasks = [];
                    let applications_json_array = [];
                    applications.forEach(function (application) {
                        asyncTasks.push(function (parallel_callback) {
                            User.findById(application.worker_user_id, function(err, user) {
                                if (err) {
                                    return parallel_callback(err);
                                }          
                                applications_json_array[applications.indexOf(application)] = application.toJSON();
                                applications_json_array[applications.indexOf(application)].user = user;
                                // applications[applications.indexOf(application)].user = user;
                                parallel_callback();
                            });
                        });
                    });

                    async.parallel(asyncTasks, function (err, results) {
                        if (err) {
                            return res.json({success: false, err: err});
                        } else {
                            res.json({ success: true, applications: applications_json_array });
                        }
                    });
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/application/search', passport.authenticate('jwt', {session: false}))
        .get(function(req, res) {
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);

                Application.find({
                    'job_id': { $in: req.query.jobs}
                }, function(err, applications) {
                    if (err) {
                        return res.json({ success: false, err: err });
                    }
                    let asyncTasks = [];
                    let applications_json_array = [];
                    applications.forEach(function (application) {
                        asyncTasks.push(function (parallel_callback) {
                            User.findById(application.worker_user_id, function(err, user) {
                                if (err) {
                                    return parallel_callback(err);
                                }          
                                applications_json_array[applications.indexOf(application)] = application.toJSON();
                                applications_json_array[applications.indexOf(application)].user = user;
                                // applications[applications.indexOf(application)].user = user;
                                parallel_callback();
                            });
                        });
                    });

                    async.parallel(asyncTasks, function (err, results) {
                        if (err) {
                            return res.json({success: false, err: err});
                        } else {
                            res.json({ success: true, applications: applications_json_array });
                        }
                    });
                });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/application/:application_id', passport.authenticate('jwt', {session: false}))
        .get(function(req, res) {
            Application.findById(req.params.application_id, function(err, application) {
                if (err) { return res.json({ success: false, err: err }); }

                if (!application) {
                    return res.status(403).send({ success: false, msg: 'Cannot get such an application.' });
                } else {
                    User.findById(application.worker_user_id, function(err, user) {
                        let application_json = application.toJSON();
                        application_json.user = user;
                        res.json({ success: true, application: application_json });
                    });
                }
            });
        });

    router.route('/review/search', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            let final_condition = {};
            if (req.body.company_id) {
                final_condition['company_id'] = req.body.company_id;
            }
            if (req.body.worker_user_id) {
                final_condition['worker_user_id'] = req.body.worker_user_id;
            }

            Review.find(final_condition, function(err, reviews) {
                if (err) {
                    return res.json({ success: false, err: err });
                }
                res.json({ success: true, reviews: reviews });
            });
        });

    router.route('/review', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            req.body.datetime = new Date();
            let newReview = new Review(req.body);
            newReview.save(function(err) {
                if (err) {
                    return res.json({ success: false, msg: 'Review couldn\'t be added.' });
                }
                res.json({ success: true, review: newReview });
            });
        });

    // router.route('/recruit', passport.authenticate('jwt', {session: false}))
    //     .post(function(req, res) {
    //         let token = getToken(req.headers);
    //         if (token) {
    //             let decoded = jwt.decode(token, config.secret);
    //             let conditions = {};
    //             let asyncSuperTasks = [];
    //             let asyncJobTasks = [];
    //             let received_user_ids_for_this_recruit = [];

    //             asyncSuperTasks.push(function(parallel_super_callback) {
    //                 let one_year_ago = new Date();
    //                 one_year_ago.setFullYear(one_year_ago.getFullYear() - 1);

    //                 let my_workers_id_array = [];
    //                 MyWorker.find({
    //                     company_id: req.body.company_id
    //                 }, function(err, myworkers) {
                        
    //                     if (err) {
    //                         return parallel_super_callback(err);
    //                     }
    //                     myworkers.forEach(function(myworker) {
    //                         my_workers_id_array.push(mongoose.Types.ObjectId(myworker.worker_user_id));
    //                     });

    //                     conditions["newjob"] = {
    //                         "$or": [
    //                             {
    //                                 "worker.is_newjob_lock": false
    //                             },
    //                             {
    //                                 "worker.is_newjob_lock": true,
    //                                 "created_at": {
    //                                     $lt: one_year_ago
    //                                 }
    //                             },
    //                             {
    //                                 "_id": {
    //                                     $in: my_workers_id_array
    //                                 }
    //                             }
    //                         ]
    //                     };
    //                     parallel_super_callback();
    //                 });
    //             });

    //             if (req.body.re_recruit_user_ids) {
    //                 asyncSuperTasks.push(function(parallel_super_callback) {
    //                     let re_recruit_users_id_array = [];
    //                     req.body.re_recruit_user_ids.forEach(function(re_recruit_user_id) {
    //                         re_recruit_users_id_array.push(mongoose.Types.ObjectId(re_recruit_user_id));
    //                     });
    //                     conditions["re_recruit_users"] = {
    //                         "_id": { 
    //                             $in: re_recruit_users_id_array
    //                         }
    //                     };
    //                     parallel_super_callback();
    //                 });
    //             }

    //             req.body.job_ids.forEach(function(job_id) {
    //                 asyncJobTasks.push(function(parallel_job_callback) {
    //                     Job.findById(job_id, function(err, job) {
    //                         if (err) {
    //                             return parallel_job_callback(err);
    //                         }
    //                         conditions["near_user_ids"] = null;
    //                         if (req.body.broadcast) {
    //                             let asyncLocationTasks = [];
    //                             let near_users_array = [];
    //                             job.locations.forEach(function(location) {
    //                                 asyncLocationTasks.push(function(parallel_location_callback) {
    //                                     User.find({
    //                                         "worker.location.loc": { 
    //                                             $near: location.loc, 
    //                                             $maxDistance:  req.body.broadcast * constDegreeInMiles // consider earth radius
    //                                         }
    //                                     }, function(err, users) {
    //                                         if (err) {
    //                                             return parallel_location_callback(err);
    //                                         }
    //                                         near_users_array = near_users_array.concat(users);
    //                                         parallel_location_callback();
    //                                     });
    //                                 });
    //                             });
    //                             async.parallel(asyncLocationTasks, function(err, results) {
    //                                 if (err) {
    //                                     return parallel_job_callback(err);
    //                                 }
    //                                 let near_user_ids = _.uniq(near_users_array, 'username').map(function (near_user) {
    //                                     return near_user._id.toString();
    //                                 });
    //                                 conditions["near_user_ids"] = {
    //                                     "_id": {
    //                                         $in: near_user_ids
    //                                     }
    //                                 };
    //                                 async.parallel(asyncSuperTasks, function(err, results) {
    //                                     debugger;
    //                                     if (err) {
    //                                         return parallel_job_callback(err);
    //                                     }
    //                                     let final_condition;
    //                                     if (!conditions["re_recruit_users"]) {
    //                                         final_condition = {
    //                                             $and: [
    //                                                 conditions["near_user_ids"],
    //                                                 conditions["newjob"]
    //                                             ]
    //                                         };
    //                                     }
    //                                     else if (!conditions["near_user_ids"] || !conditions["newjob"]) {
    //                                         final_condition = conditions["re_recruit_users"];
    //                                     }
    //                                     else {
    //                                         final_condition = {
    //                                             $or: [
    //                                                 conditions["re_recruit_users"],
    //                                                 {
    //                                                     $and: [
    //                                                         conditions["near_user_ids"],
    //                                                         conditions["newjob"]
    //                                                     ]
    //                                                 }
    //                                             ]
    //                                         };
    //                                     }
                                        
    //                                     console.log(JSON.stringify(final_condition));

    //                                     User.find(final_condition, '_id', function(err, user_ids) {
    //                                         if (err) {
    //                                             return parallel_job_callback(err);
    //                                         }
    //                                         else {
    //                                             let received_user_ids = user_ids.map(function(user_id_object){
    //                                                     return user_id_object._id.toString();
    //                                             });
    //                                             received_user_ids_for_this_recruit = received_user_ids_for_this_recruit.concat(received_user_ids);
    //                                             let request_body = JSON.stringify({
    //                                                 'job_id': job_id,
    //                                                 'type': 'recruit',
    //                                                 'sender_user_id': decoded._id.toString(),
    //                                                 'receivers': received_user_ids,
    //                                                 'message': 'Recruit for job',
    //                                                 'auto_tranlate': false,
    //                                                 'datetime': new Date()
    //                                             });

    //                                             let headers = {
    //                                                 'Content-Length': Buffer.byteLength(request_body),
    //                                                 'authorization': req.headers.authorization,
    //                                                 'content-type': 'application/json'
    //                                             };

    //                                             request.post({
    //                                                 url: config.site_url + '/message',
    //                                                 headers: headers,
    //                                                 body: request_body
    //                                             }, function(error, response, body) {
    //                                                 if (!error) {
    //                                                     console.log(body);
    //                                                 } else {
    //                                                     console.error('Error:', error);
    //                                                 }
    //                                                 // res.end( );
    //                                             });
    //                                             parallel_job_callback(null, received_user_ids);
    //                                         }
    //                                     });
    //                                 });
    //                             });
    //                         }
    //                         else {
    //                             async.parallel(asyncSuperTasks, function(err, results) {
    //                                 debugger;
    //                                 if (err) {
    //                                     return parallel_job_callback(err);
    //                                 }
    //                                 let final_condition;
    //                                 if (!conditions["re_recruit_users"]) {
    //                                     final_condition = {
    //                                         $and: [
    //                                             conditions["near_user_ids"],
    //                                             conditions["newjob"]
    //                                         ]
    //                                     };
    //                                 }
    //                                 else if (!conditions["near_user_ids"] || !conditions["newjob"]) {
    //                                     final_condition = conditions["re_recruit_users"];
    //                                 }
    //                                 else {
    //                                     final_condition = {
    //                                         $or: [
    //                                             conditions["re_recruit_users"],
    //                                             {
    //                                                 $and: [
    //                                                     conditions["near_user_ids"],
    //                                                     conditions["newjob"]
    //                                                 ]
    //                                             }
    //                                         ]
    //                                     };
    //                                 }
                                    
    //                                 console.log(JSON.stringify(final_condition));

    //                                 User.find(final_condition, '_id', function(err, user_ids) {
    //                                     if (err) {
    //                                         return parallel_job_callback(err);
    //                                     }
    //                                     else {
    //                                         let received_user_ids = user_ids.map(function(user_id_object){
    //                                                 return user_id_object._id.toString();
    //                                         });
    //                                         received_user_ids_for_this_recruit = received_user_ids_for_this_recruit.concat(received_user_ids);
    //                                         let request_body = JSON.stringify({
    //                                             'job_id': job_id,
    //                                             'type': 'recruit',
    //                                             'sender_user_id': decoded._id.toString(),
    //                                             'receivers': received_user_ids,
    //                                             'message': 'Recruit for job',
    //                                             'auto_tranlate': false,
    //                                             'datetime': new Date()
    //                                         });

    //                                         let headers = {
    //                                             'Content-Length': Buffer.byteLength(request_body),
    //                                             'authorization': req.headers.authorization,
    //                                             'content-type': 'application/json'
    //                                         };

    //                                         request.post({
    //                                             url: config.site_url + '/message',
    //                                             headers: headers,
    //                                             body: request_body
    //                                         }, function(error, response, body) {
    //                                             if (!error) {
    //                                                 console.log(body);
    //                                             } else {
    //                                                 console.error('Error:', error);
    //                                             }
    //                                             // res.end( );
    //                                         });
    //                                         parallel_job_callback(null, received_user_ids);
    //                                     }
    //                                 });
    //                             });
    //                         }
    //                     });
    //                 });
    //             });

    //             async.parallel(asyncJobTasks, function(err, results) {
    //                 debugger;
    //                 if (err) {
    //                     return res.json({success: false, err: err, reason: 'Error happened while processing on job'});
    //                 }
    //                 else {
    //                     let receiver_ids = _.uniq(received_user_ids_for_this_recruit);
    //                     let newRecruit = new Recruit({
    //                         request: req.body, 
    //                         received_user_ids: receiver_ids
    //                     });
    //                     newRecruit.save(function(err) {
    //                         if (err) {
    //                             return res.json({success: false, err: err, reason: 'Recruit Save failed'});
    //                         }
    //                         res.json({ success: true, recruit: newRecruit.toJSON() });
    //                     });
    //                 }
    //             });
                
    //         } else {
    //             return res.status(403).send({success: false, msg: 'No token provided.'});
    //         }
    //     });

    router.route('/support/email', passport.authenticate('jwt', {session: false}))
        .post(function(req, res) {
            debugger;
            let token = getToken(req.headers);
            if (token) {
                let decoded = jwt.decode(token, config.secret);
                getCompanyPartOfMail(decoded)
                    .then(company_part => {
                        let html = `<div>
                                <p>A user from Ganaz platform filed a ticket.</p>
                                <p>Name: ${decoded.firstname} ${decoded.lastname}</p>
                                <p>Email: ${decoded.email_address}</p>
                                <p>Login: ${decoded.username}</p>
                                <p>Type: ${decoded.type}</p>
                                ` + company_part + 
                                ` 
                                <p>Phone: ${decoded.phone_number.local_number}</p>
                                <p>===================</p>
                                <p>Subject: ${req.body.subject}</p>
                                <p>Message: ${req.body.message}</p>
                                <p>===================</p>
                                <p>Thank you.</p>
                            </div>`;
                        sendmail_client({
                            from: decoded.email_address,
                            to: config.support_mail,
                            subject: req.body.subject,
                            html: html
                        }, function(err, reply) {
                            if (err) {
                                console.log(err && err.stack);
                                return res.json({success: false, msg: 'Cannot sent mail'});
                            }
                            console.dir(reply);
                            res.json({success: true, msg: 'Sent mail to support team'});
                        });

                        // sendmail_client({
                        //     from: 'adam.lindberg520@gmx.com',
                        //     to: 'super.savych@yandex.com',
                        //     subject: req.body.subject,
                        //     html: html
                        // }, function(err, reply) {
                        //     if (err) {
                        //         console.log(err && err.stack);
                        //         return res.json({success: false, msg: 'Cannot sent mail'});
                        //     }
                        //     console.dir(reply);
                        //     res.json({success: true, msg: 'Sent mail to support team'});
                        // });
                    });
            } else {
                return res.status(403).send({success: false, msg: 'No token provided.'});
            }
        });

    router.route('/plans')
        .get(function(req, res) {
            Membership.find({}, function(err, memberships) {
                if (err) {
                    return res.json({ success: false, msg: 'Cannot retrieve memberships'});
                }
                res.json({ success: true, plans: memberships });
            });
        });

    const apiV1 = express();
    apiV1.use('/', headerChecker);
    apiV1.use('/', router);
    apiV1.use('/invite', inviteRoutes);
    apiV1.use('/recruit', recruitRoutes);
    app.use('/api/v1/', apiV1);

    let isValidUserInfo = function(body) {
        if (!body ||
            !body.username ||
            !body.firstname ||
            !body.lastname ||
            !body.type ||
            !body.auth_type)
            return false;
        if ((body.type == 'company-regular' || body.type == 'company-admin') && (!body.company || !body.company.company_id))
            return false;
        return true;
    };

    let getToken = function(headers) {
        if (headers && headers.authorization) {
            let parted = headers.authorization.split(' ');
            if (parted.length === 2) {
                return parted[1];
            } else {
                return null;
            }
        } else {
            return null;
        }
    };

    let calculateReviewScore = function(company_user_id) {
        return new Promise((resolve, reject) => {
            Review.find({
                company_user_id: company_user_id
            }, function (err, reviews) {
                if (err || !reviews.length) {
                    resolve(0, 0);
                }
                if (reviews.length > 0) {
                    let total_score = 0;
                    reviews.forEach(function(review) {
                        let { rating } = review;
                        total_score += rating.pay + rating.benefits + rating.supervisors + rating.safety + rating.trust;
                    });
                    resolve({total_score: total_score /5, total_review: reviews.length});
                }
            });
        });
    };

    let calculateReviewStats = function(company_id) {
        return new Promise((resolve, reject) => {
            Review.find({
                company_id: company_id
            }, function (err, reviews) {
                if (err || !reviews.length) {
                    resolve({
                        total_reviews: 0,
                        total_score: 0
                    });
                }
                if (reviews.length > 0) {
                    let total_score = 0;
                    reviews.forEach(function(review) {
                        let { rating } = review;
                        total_score += rating.pay + rating.benefits + rating.supervisors + rating.safety + rating.trust;
                    });
                    resolve({
                        total_score: total_score /5, 
                        total_review: reviews.length
                    });
                }
            });
        });
    };

    let calculateActivityStats = function(company_id) {
        return new Promise((resolve, reject) => {
            Job.find({
                company_id
            }, '_id', function(err, jobs) {
                if (err)
                {
                    return parallel_callback(null, {total_jobs: 0});
                }
                let jobs_id_array = jobs.map(function(job) {
                    return job.id.toString();
                });
                let asyncTasks = {};
                asyncTasks.recruits = (parallel_callback) => {
                    Recruit.find({
                        "request.job_id": {
                            $in: jobs_id_array
                        }
                    }, function(err, recruits) {
                        parallel_callback(null, recruits);
                    });
                };

                asyncTasks.messages = (parallel_callback) => {
                    Message.find({
                        job_id: { $in: jobs_id_array }
                    }, function(err, messages) {
                        parallel_callback(null, messages);
                    });
                };

                async.parallel(asyncTasks, function(err, results) {
                    resolve({
                        total_jobs: jobs_id_array.length,
                        total_recruits: results.recruits.length,
                        total_messages_sent: results.messages.length
                    });
                });
            });
        });
    };

    let calculateStatsOfCompany = function(company_id) {
        return new Promise((resolve, reject) => {
            let asyncTasks = {};
            asyncTasks.review_stats = (parallel_callback) => {
                calculateReviewStats(company_id).then(review_stats => {
                    parallel_callback(null, review_stats);
                });
            };
            asyncTasks.activity_stats = (parallel_callback) => {
                calculateActivityStats(company_id).then(activity_stats => {
                    parallel_callback(null, activity_stats);
                });
            };

            async.parallel(asyncTasks, function(err, results) {
                if (err) {
                    return reject(err);
                }
                resolve(results);
            });
        });
    };

    let attachCompanyDataToUserJson = function(user_json) {
        return new Promise((resolve, reject) => {
            if (user_json.company && user_json.company.company_id) 
            {
                Company.findById(user_json.company.company_id, function(err, company) {
                    if (err) {
                        return reject(err);
                    }
                    calculateStatsOfCompany(company._id.toString()).then(({review_stats, activity_stats}) => {
                        user_json.company.account = company.toJSON();
                        user_json.company.account.review_stats = review_stats;
                        user_json.company.account.activity_stats = activity_stats;
                        resolve(user_json);
                    });
                });
            } else {
                resolve(user_json);
            }
        });
    };

    let getCompanyPartOfMail = function(user) {
        return new Promise((resolve, reject) => {
            if (user.type == 'company-regular' || user.type == 'company-admin') {
                Company.findById(user.company.company_id, function(err, company){
                    if (err) {
                        return resolve('');
                    }
                    resolve(`<p>Company Name: ${company.name.es}</p>
                            <p>Company Code: ${company.code}</p>`);
                });
            } else {
                resolve('');
            }
        });
    };

    let generate_pin_code = function() {
        return Math.floor(1000 + Math.random() * 9000).toString();
    };
}