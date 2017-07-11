module.exports = {
  isUSPhoneNumber: function (str) {
    // Matches xxx-xxx-xxxx, (xxx) xxx-xxxx, xxxxxxxxxx (where x is a number or digit)
    const pattern = /^\d{10}|((\([0-9]{3}\) |[0-9]{3}-)[0-9]{3}-[0-9]{4})$/;
    return pattern.test(str);
  }
};