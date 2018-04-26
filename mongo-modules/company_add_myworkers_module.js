var companyId = "5ad061fd3ca2c54ba22cc09c";                     // Ganaz Inc
var crewId = "5ad0629f3ca2c54ba22cc0a2";                        // App Users (988)
var pageSize = 50;
var pageNum = 1;
var userIds = db.getCollection("users").find({"type": "worker"}).skip((pageNum - 1) * pageSize).limit(pageSize).map(function(user) {
    db.getCollection("myworkers").insert({
        "company_id": companyId,
        "worker_user_id": user._id.valueOf(),
        "crew_id": crewId,
        "__v": NumberInt(0)
    });
    return user._id;
});

print(userIds.length);

/////////////////// Remove partially added page_id
var companyId = "5ad061fd3ca2c54ba22cc09c";
var crewId = "5ad0629f3ca2c54ba22cc0a2";
var pageSize = 50;
var pageNum = 13;
var userIds = db.getCollection("users").find({"type": "worker"}).skip((pageNum - 1) * pageSize).limit(pageSize).map(function(user) {
    return user._id.valueOf();
});

db.getCollection("myworkers").remove({"company_id": companyId, "crew_id": crewId, "worker_user_id": {"$in": userIds}});

////////////////

var companyId = "5ad061fd3ca2c54ba22cc09c";                     // Ganaz Inc
var crewId = "5ad062bc3ca2c54ba22cc0a3";                        // US SMS Users (1562)
var pageSize = 50;
var pageNum = 1;
var userIds = db.getCollection("users").find({"type": "worker"}).skip((pageNum - 1) * pageSize).limit(pageSize).map(function(user) {
    db.getCollection("myworkers").insert({
        "company_id": companyId,
        "worker_user_id": user._id.valueOf(),
        "crew_id": crewId,
        "__v": NumberInt(0)
    });
    return user._id;
});

print(userIds.length);

////////////////

var companyId = "5ad061fd3ca2c54ba22cc09c";                     // Ganaz Inc
var crewId = "5ad0632d3ca2c54ba22cc0a4";                        // AW San Quintin vs AW Vizcaino MX Users (1304)
var companyVanId = "5ac2cd2a3ca2c54ba2c5f24d";
var companySanId = "5ac288b93ca2c54ba2c3931b";

var pageSize = 50;
var pageNum = 13;
var userIds = db.getCollection("users").find({"type": "onboarding-worker", "phone_number.country_code": "52", "$or": [{"worker.job_search_lock.allowed_company_ids": companyVanId}, {"worker.job_search_lock.allowed_company_ids": companySanId}]}).skip((pageNum - 1) * pageSize).limit(pageSize).map(function(user) {
    db.getCollection("myworkers").insert({
        "company_id": companyId,
        "worker_user_id": user._id.valueOf(),
        "crew_id": crewId,
        "__v": NumberInt(0)
    });
    return user._id;
});

print(userIds.length);


////////////////

var companyId = "5ad061fd3ca2c54ba22cc09c";                     // Ganaz Inc
var crewId = "5ad063483ca2c54ba22cc0a5";                        // MX-SMS Users (842)
var companyVanId = "5ac2cd2a3ca2c54ba2c5f24d";
var companySanId = "5ac288b93ca2c54ba2c3931b";

var pageSize = 50;
var pageNum = 13;
var userIds = db.getCollection("users").find({"type": "onboarding-worker", "phone_number.country_code": "52", "$nor": [{"worker.job_search_lock.allowed_company_ids": companyVanId}, {"worker.job_search_lock.allowed_company_ids": companySanId}]}).skip((pageNum - 1) * pageSize).limit(pageSize).map(function(user) {
    db.getCollection("myworkers").insert({
        "company_id": companyId,
        "worker_user_id": user._id.valueOf(),
        "crew_id": crewId,
        "__v": NumberInt(0)
    });
    return user._id;
});

print(userIds.length);

////////////////
