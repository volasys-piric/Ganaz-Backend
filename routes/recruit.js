import express from 'express';
import jwt from 'jwt-simple';
import async from 'async';
import request from 'request';
import passport from 'passport';
import config from './../config/database';
import http from './../utils/http';
import Job from './../app/models/job';
import User from './../app/models/user';
import Recruit from './../app/models/recruit';

const router = express.Router();
router.route('/', passport.authenticate('jwt', {session: false}))
  .post(function (req, res) {
    let token = http.getToken(req.headers);
    if (token) {
      let decoded = jwt.decode(token, config.secret);
      let conditions = {};
      let asyncSuperTasks = [];
      let received_user_ids_for_this_recruit = [];
      let company_id = decoded.company.company_id;
      let company_user_id = decoded._id;

      let one_year_ago = new Date();
      one_year_ago.setFullYear(one_year_ago.getFullYear() - 1);

      conditions["newjob_lock"] = {
        "$or": [
          {
            "worker.is_newjob_lock": false
          },
          {
            "worker.is_newjob_lock": true,
            "created_at": {
              "$lt": one_year_ago
            }
          }
        ]
      };

      let re_recruit_users_id_array = [];
      if (req.body.re_recruit_worker_user_ids) {
        req.body.re_recruit_worker_user_ids.forEach(function (re_recruit_user_id) {
          re_recruit_users_id_array.push(mongoose.Types.ObjectId(re_recruit_user_id));
        });
      }

      conditions["re_recruit_users"] = {
        "_id": {
          "$in": re_recruit_users_id_array
        }
      };

      let asyncJobTasks = [];
      req.body.job_ids.forEach(function (job_id) {
        asyncJobTasks.push(function (parallel_job_callback) {
          Job.findById(job_id, function (err, job) {
            if (err) {
              return parallel_job_callback(err);
            }
            // create recruit for the job.

            let condition_final;
            let condition_broadcast;
            let condition_re_recruit;
            let asyncRecruitTasks = [];

            if (req.body.broadcast_radius) {
              // get broad_cast condition on job

              asyncRecruitTasks.push(function (parallel_recruit_callback) {
                let asyncLocationTasks = [];
                let near_users_array = [];

                job.locations.forEach(function (location) {
                  asyncLocationTasks.push(function (parallel_location_callback) {
                    User.find({
                      "worker.location.loc": {
                        "$near": location.loc,
                        "$maxDistance": constDegreeInMiles * req.body.broadcast_radius
                      }
                    }, function (err, users) {
                      if (err) {
                        return parallel_location_callback(err);
                      }
                      near_users_array = near_users_array.concat(users);
                      parallel_location_callback();
                    });
                  });
                });

                async.parallel(asyncLocationTasks, function (err, results) {
                  if (err) {
                    return parallel_job_callback(err);
                  }

                  let near_user_ids = _.uniq(near_users_array, 'username').map(function (near_user) {
                    return near_user._id;
                  });

                  conditions["near_user_ids"] = {
                    "_id": {
                      "$in": near_user_ids
                    }
                  };

                  condition_broadcast = {
                    "$and": [
                      conditions["newjob_lock"],
                      conditions["near_user_ids"]
                    ]
                  };

                  parallel_recruit_callback();
                });


              });
            }

            if (req.body.re_recruit_worker_user_ids) {
              asyncRecruitTasks.push(function (parallel_recruit_callback) {
                condition_re_recruit = conditions["re_recruit_users"];
                parallel_recruit_callback();
              });

            }

            if (req.body.re_recruit_worker_user_ids == null && req.body.broadcast_radius == null) {
              asyncRecruitTasks.push(function (parallel_recruit_callback) {
                parallel_recruit_callback();
              });
            }
            // Final Condition
            async.parallel(asyncRecruitTasks, function (err, results) {
              if (condition_re_recruit && condition_broadcast) {
                condition_final = {
                  "$or": [
                    condition_broadcast,
                    condition_re_recruit
                  ]
                };
              }
              else if (condition_re_recruit) {
                condition_final = condition_re_recruit;
              }
              else if (condition_broadcast) {
                condition_final = condition_broadcast;
              }
              else {

              }

              User.find(condition_final, '_id', function (err, user_ids) {
                if (err) {
                  return parallel_job_callback(err);
                }
                else {
                  let recruited_worker_user_ids = user_ids.map(function (user_id_object) {
                    return user_id_object._id.toString();
                  });
                  let newRecruit = new Recruit({
                    company_id,
                    company_user_id,
                    request: {
                      job_id: job._id,
                      broadcast_radius: req.body.broadcast_radius,
                      re_recruit_worker_user_ids: req.body.re_recruit_worker_user_ids
                    },
                    recruited_worker_user_ids
                  });

                  newRecruit.save(function (err, recruit) {
                    if (err) {
                      return parallel_job_callback(err);
                    }

                    let receivers = recruited_worker_user_ids.map(function (receiver_id) {
                      return {
                        'user_id': receiver_id,
                        'company_id': ''
                      };
                    });

                    let request_body = JSON.stringify({
                      'job_id': job_id,
                      'type': 'recruit',
                      'sender': {
                        'user_id': company_user_id,
                        'company_id': company_id
                      },
                      'receivers': receivers,
                      "message": {
                        "en": "New work available",
                        "es": "Nuevo trabajo disponible"
                      },
                      'auto_tranlate': "true",
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
                    }, function (error, response, body) {
                      if (!error) {
                        console.log(body);
                        parallel_job_callback(null, recruit);
                      } else {
                        console.error('Error:', error);
                        parallel_job_callback(error);
                      }
                      // res.end( );
                    });

                    // parallel_job_callback(null, recruit);
                  });
                }
              });
            });
          });

        });

      });

      async.parallel(asyncJobTasks, function (err, results) {
        if (err) {
          res.json({
            success: false, message: "Failed to recruit users"
          });

        }
        else {
          res.json({
            success: true, recruits: results
          });
        }
      });
    } else {
      return res.status(403).send({success: false, msg: 'No token provided.'});
    }
  });


export default router