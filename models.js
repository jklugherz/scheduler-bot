var mongoose = require('mongoose');

var userSchema = mongoose.Schema({
  username: String,
  password: String
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
