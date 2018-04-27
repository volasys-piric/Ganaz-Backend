var companyIds = db.getCollection("companies").find({}).map(function(company) {
    var numberOfUsers = db.getCollection("users").find({"company.company_id": company._id.valueOf()}).count();
    if (numberOfUsers == 0) {
        return company._id;
    }
    else {
    }
    return "";
});

db.getCollection("companies").remove({"_id": {"$in": companyIds}});
