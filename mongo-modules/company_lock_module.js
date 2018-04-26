var companyId = "5aba96868a8e824cd27a50a7";
var userIds = db.getCollection("myworkers").find({"company_id": companyId}).map(function(myworker) {
    return ObjectId(myworker.worker_user_id);
});

db.getCollection("users").updateMany({"_id": {"$in": userIds}},
{
    $set: {"worker.job_search_lock.lock": true},
    $push: {"worker.job_search_lock.allowed_company_ids": companyId}
});

db.getCollection("users").find({"_id": {"$in": userIds}});

///////////

db.getCollection('companies').find({"name.en": /.*AW San Quintin.*/})
