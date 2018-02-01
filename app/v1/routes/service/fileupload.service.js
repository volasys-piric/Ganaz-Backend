const os = require('os');
const fs = require('fs');
const formatter = require('./../../../../app/utils/formatter');

const dir = os.tmpdir() + '/ganaz-backend-uploads/';
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir);
}
const multer = require('multer');
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, dir)
  },
  filename: function(req, file, cb) {
    const now = new Date();
    const filename = formatter.formatDateToYYYYMMDDHHmm(now) + '_' + file.originalname;
    cb(null, filename)
  }
});
const multerInstance = multer({storage: storage});

module.exports = {
  multerInstance: multerInstance
};