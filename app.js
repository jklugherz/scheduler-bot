var express = require( 'express' );
var session = require( 'express-session' );
var path = require( 'path' );
var bodyParser = require( 'body-parser' );
var { rtm } = require( './bot' )
var google = require( 'googleapis' );
var OAuth2 = google.auth.OAuth2;
var { User } = require( './models' );

var app = express();

app.use( bodyParser.json() );
app.use( bodyParser.urlencoded( { extended: false } ) );

function getGoogleAuth() {
    return new OAuth2(
        process.env.OAUTH_CLIENT_ID,
        process.env.OAUTH_SECRET,
        process.env.DOMAIN + '/oauthcallback'
    );
};

app.get( '/connect', ( req, res ) => {
    var userId = req.query.user;
    console.log( 'USERID HERE', userId );
    if ( !userId ) {
        res.status( 400 ).send( 'Missing user id' );
    } else {
        User.findById( userId )
            .then( function ( user ) {
                if ( !user ) {
                    res.status( 404 ).send( 'Cannot find user' );
                } else { //have a user, ready to connect to google
                    var oauth2Client = getGoogleAuth();
                    var url = oauth2Client.generateAuthUrl( {
                        access_type: 'offline',
                        prompt: 'consent',
                        scope: [
                            'https://www.googleapis.com/auth/userinfo.profile',
                            'https://www.googleapis.com/auth/calendar'
                        ],
                        state: encodeURIComponent( JSON.stringify( {
                            auth_id: userId
                        } ) )
                    } );
                    res.redirect( url ); //send to google to authenticate
                };
            } );
    };
} );

app.get( '/oauthcallback', function ( req, res ) {
    //callback contains an authorization code, use it to get a token.
    var googleAuth = getGoogleAuth();
    googleAuth.getToken( req.query.code, function ( err, tokens ) { //turn code into tokens (google's credentials)
        if ( err ) {
            console.log('error 1');
            res.status( 500 ).json( { error: err } );
        } else {
            googleAuth.setCredentials( tokens ); //initialize google library with all credentials so it can make requests
            var plus = google.plus( 'v1' );
            plus.people.get( { auth: googleAuth, userId: 'me' }, function ( err, googleUser ) {
                if ( err ) {
                    console.log('error 2');
                    res.status( 500 ).json( { error: err } );
                } else {
                    User.findById(JSON.parse(decodeURIComponent(req.query.state )).auth_id)
                        .then( function ( mongoUser ) {
                            mongoUser.google = tokens;
                            mongoUser.google.profile_id = googleUser.id;
                            mongoUser.google.profile_name = googleUser.displayName;
                            return mongoUser.save();
                        } )
                        .then( function ( mongoUser ) {
                            res.send( 'You are connected to Google Calendar!' ); //sends to webpage
                            rtm.sendMessage( 'You are connected to Google Calendar!' ); //sends from bot to user
                        } )
                        .catch( function ( err ) { console.log( 'Server error at /oauthcallback', err ); } );
                };
            } )
        }
    } )
} );

app.get( '/', ( req, res ) => {
    res.send( 'received :fire:' )
} );

app.post( '/slack/interactive', ( req, res ) => {
    var payload = JSON.parse( req.body.payload );
    console.log( payload );
    if ( payload.actions[0].value === 'true' ) {
        //here we actually create the reminder
        res.send( 'Creating event! :fire: ' );
    } else {
        res.send( 'Cancelled :x:' )
    }
} );

app.listen( 3000 );
