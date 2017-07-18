var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  username: String,
  password: String
});

var reminderSchema = mongoose.Schema({
  subject: String,
  date: Date
});

User = mongoose.model('User', userSchema);
Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = {
    User:User,
    Reminder:Reminder
};
