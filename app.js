var express = require( 'express' );
var session = require( 'express-session' );
var path = require( 'path' );
var bodyParser = require( 'body-parser' );
require('./bot')
var app = express();

app.use( bodyParser.json() );
app.use( bodyParser.urlencoded( { extended: false } ) );


app.get('/', (req, res) => {
  res.send('received :fire:')
})

app.post('/slack/interactive', (req, res) => {
  var payload = JSON.parse(req.body.payload);
  console.log(payload);
  if (payload.actions[0].value === 'true') {
    res.send('Created reminder :white_check_mark:')
  } else {
    res.send('Cancelled :x:')
  }
})

app.listen(3000);
