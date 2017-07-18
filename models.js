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
  google: {}
});

var taskSchema = mongoose.Schema({
  subject: String,
  date: Date
});

User = mongoose.model('User', userSchema);
Task = mongoose.model('Task', taskSchema);

module.exports = {
    User: User,
    Task: Task
};
