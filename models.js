var mongoose = require('mongoose');
mongoose.Promise = global.Promise;

mongoose.connect(process.env.MONGODB_URI);

var userSchema = mongoose.Schema({
  slackId: {
    type: String,
    required: true
  },
  slackDmId: {
    type: String,
    required: true
  },
  google: {},
  pendingInfo: {}
});

var reminderSchema = mongoose.Schema({
  subject: String,
  date: String,
  userId: String
});

var User = mongoose.model('User', userSchema);
var Reminder = mongoose.model('Reminder', reminderSchema);

module.exports = {
    User: User,
    Reminder: Reminder
};
