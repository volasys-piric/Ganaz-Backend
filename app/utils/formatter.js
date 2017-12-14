function padLeft(str, pad) {
  str = '' + str;
  if (pad === null || pad === undefined) {
    pad = "00";
  }
  return pad.substring(0, pad.length - str.length) + str;
}

module.exports = {
  formatDateToYYYYMMDDHHmm: function (date) {
    return date.getFullYear() + padLeft(date.getMonth() + 1) + padLeft(date.getDate()) +
        padLeft(date.getHours()) + padLeft(date.getMinutes()) + padLeft(date.getSeconds());
  }
};