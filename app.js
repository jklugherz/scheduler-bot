var express = require( 'express' );
var session = require( 'express-session' );
var path = require( 'path' );
var bodyParser = require( 'body-parser' );
require( './bot' )
var app = express();

var google = require('googleapis');
var OAuth2 = google.auth.OAuth2;
var { User } = require('./models');

app.use( bodyParser.json() );
app.use( bodyParser.urlencoded( { extended: false } ) );


app.get( '/', ( req, res ) => {
    res.send( 'received :fire:' )
} )

app.post( '/slack/interactive', ( req, res ) => {
    var payload = JSON.parse( req.body.payload );
    console.log( payload );
    if ( payload.actions[0].value === 'true' ) {
        res.send( 'Creating event! :fire: ');
    } else {
        res.send( 'Cancelled :x:' )
    }
} )

function getGoogleAuth() {
  return new OAuth2(
      process.env.OAUTH_CLIENT_ID,
      process.env.OAUTH_SECRET,
      process.env.DOMAIN + '/oauthcallback'
  );
};

app.get( '/connect', ( req, res ) => {
    var userId = req.query.user;
    if (!userId) {
      res.status(400).send('Missing user id');
    } else {
      User.findById(userId)
      .then(function(user) {
        if (!user) {
          res.status(404).send('Cannot find user');
        } else { //have a user, ready to connect to google
          var oauth2Client = getGoogleAuth();
          var url = oauth2Client.generateAuthUrl({
              access_type: 'offline',
              prompt: 'consent',
              scope: [
                  'https://www.googleapis.com/auth/userinfo.profile',
                  'https://www.googleapis.com/auth/calendar'
              ],
              state: userId
              // encodeURIComponent(JSON.stringify( {
              //     auth_id: req.query.auth_id
              // }))
          });
          res.redirect( url );
        };
      });
    };
});

app.get( '/oauthcallback', function ( req, res ) {
    // console.log( 'hello' );
    // console.log( req.query.code );
    // res.send('Good job tommy')
    res.json({
      code: req.query.code,
      state: req.query.state
    })
} )

app.listen( 3000 );
