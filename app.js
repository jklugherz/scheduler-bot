var express = require( 'express' );
var session = require( 'express-session' );
var path = require( 'path' );
var bodyParser = require( 'body-parser' );
var { rtm, pendingUsers } = require( './bot' )
var google = require( 'googleapis' );
var googleAuth = require( 'google-auth-library' );
var OAuth2 = google.auth.OAuth2;
var { User, Reminder } = require( './models' );
var moment = require('moment');

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
            res.status( 500 ).json( { error: err } );
        } else {
            googleAuth.setCredentials( tokens ); //initialize google library with all credentials so it can make requests
            var plus = google.plus( 'v1' );
            plus.people.get( { auth: googleAuth, userId: 'me' }, function ( err, googleUser ) {
                if ( err ) {
                    res.status( 500 ).json( { error: err } );
                } else {
                    User.findById( JSON.parse( decodeURIComponent( req.query.state ) ).auth_id )
                        .then( function ( mongoUser ) {
                            mongoUser.google = tokens;
                            mongoUser.google.profile_id = googleUser.id;
                            mongoUser.google.profile_name = googleUser.displayName;
                            return mongoUser.save();
                        } )
                        .then( function ( mongoUser ) {
                            res.send( 'You are connected to Google Calendar!' ); //sends to webpage
                        } )
                        .catch( function ( err ) { console.log( 'Server error at /oauthcallback', err ); } );
                };
            } )
        }
    } )
} );

app.get( '/', ( req, res ) => {
    res.send( 'Event created! :fire:' )
} );

app.post( '/slack/interactive', ( req, res ) => {
    var payload = JSON.parse( req.body.payload );
    console.log(payload);
    var ind = pendingUsers.indexOf(payload.user.id)
    pendingUsers.splice(ind);
    if ( payload.actions[0].value === 'true' ) {
        var subject = payload.original_message.attachments[0].fallback.split( "%" )[0]
        var date = payload.original_message.attachments[0].fallback.split( "%" )[1]
        if(payload.original_message.attachments[0].fallback.split( "%" ).length > 2){
            var time = payload.original_message.attachments[0].fallback.split( "%" )[2]
            var people = payload.original_message.attachments[0].fallback.split( "%" )[3]
        }
        var time = moment( time ).format("HH:mm:ss")
        var day = moment( date ).format( "YYYY-MM-DD" )
        if(!people){
            var rem = new Reminder( {
                subject: subject,
                date: day,
                userId: payload.original_message.attachments[0].fallback.split( "%" )[2]
            } )
            rem.save();
        }
        var event = {
            summary: people ? `meeting with ${people}${subject ? (': ' + subject) : ''}` : subject,
            description: people ? `meeting with ${people}${subject ? (': ' + subject) : ''}` : subject,
            start: {
                dateTime: time ? (date + 'T' + time + '-00:01') : (date + "T5:00:00-00:01"),
                timeZone: 'America/Los_Angeles'
            },
            end: {
                dateTime: time ? (date + 'T' + time.add(30, 'minutes') + '-00:01') : (date + "T23:59:00-00:01"),
                timeZone: 'America/Los_Angeles'
            }
        }
        var calendar = google.calendar( 'v3' );
        User.find( { slackId: payload.user.id }, function ( err, user ) {
            if ( err ) {
                throw new Error( 'err' )
            }
            else {
                var auth = getGoogleAuth();
                auth.credentials = user[0].google;
                calendar.events.insert( {
                    auth: auth,
                    calendarId: 'primary',
                    resource: event,
                }, function ( err, event ) {
                    if ( err ) {
                        console.log( 'There was an error contacting the Calendar service: ' + err );
                        return;
                    }
                    console.log( 'Event created: %s', event.htmlLink );
                } );
            }
        } )


        res.send( 'Creating event! :fire: ' );
    } else {
        res.send( 'Cancelled :x:' )
    }
} );

var port = process.env.PORT ||  3000;
app.listen( port );
