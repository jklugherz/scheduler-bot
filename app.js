var express = require( 'express' );
var session = require( 'express-session' );
var path = require( 'path' );
var bodyParser = require( 'body-parser' );
var { rtm, pendingUsers, web } = require( './bot' )
var google = require( 'googleapis' );
var googleAuth = require( 'google-auth-library' );
var OAuth2 = google.auth.OAuth2;
var { User, Reminder } = require( './models' );
var moment = require( 'moment' );

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
  if (payload.callback_id === 'conflict_resolution') {

    User.findOne( { slackId: payload.user.id }, function ( err, user ) {
        if ( err ) {
            throw new Error( err );
        }
        else {
            //console.log( user )
            var subject = user.pendingInfo.subject;
            var time = payload.actions[0].selected_options.value;
            var people = user.pendingInfo.people;
            var emails = user.pendingInfo.email;

            if ( time ) {
                var time30 = "2017-08-02 " + time
                time30 = moment( time30 ).add( 30, 'minutes' ).format( "HH:mm:ss" )
            }
            var day = moment( date ).format( "YYYY-MM-DD" )

            var calendar = google.calendar( 'v3' );

            var timedoesntWork = false;

            var event = {
              summary: people.length === 0 ? `meeting with ${ people }${ subject ? ( ': ' + subject ) : '' }` : subject,
              description: people.length === 0 ? `meeting with ${ people }${ subject ? ( ': ' + subject ) : '' }` : subject,
              start: {
                dateTime: time ? ( date + 'T' + time + '-00:01' ) : ( date + "T5:00:00-00:01" ),
                timeZone: 'America/Los_Angeles'
              },
              end: {
                dateTime: time ? ( date + 'T' + time30 + '-00:01' ) : ( date + "T23:59:00-00:01" ),
                timeZone: 'America/Los_Angeles'
              }
            }
            var auth = getGoogleAuth();
            auth.credentials = user.google;
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
            user.pendingInfo = {}
            user.save()
            res.send( 'Creating event! :fire: ' );
        }
    } );
  } else {
    var payload = JSON.parse( req.body.payload );
    var ind = pendingUsers.indexOf( payload.user.id )
    pendingUsers.splice( ind );
    if ( payload.actions[0].value === 'true' ) {
        User.findOne( { slackId: payload.user.id }, function ( err, user ) {
            if ( err ) {
                throw new Error( err );
            }
            else {
                var subject = user.pendingInfo.subject;
                var date = user.pendingInfo.date;
                var time = user.pendingInfo.time;
                var people = user.pendingInfo.people;
                console.log('pendingInfo', user.pendingInfo);

                if ( time ) {
                    var time30 = "2017-08-02 " + time
                    time30 = moment( time30 ).add( 30, 'minutes' ).format( "HH:mm:ss" )
                }
                var day = moment( date ).format( "YYYY-MM-DD" )
                if ( people.length === 0 ) {
                    var rem = new Reminder( {
                        subject: subject,
                        date: day,
                        userId: user.slackId
                    } )
                    rem.save();
                }
                var calendar = google.calendar( 'v3' );

                var hasConflicts = false;
                people.forEach( function ( inviteeObj, idx ) {
                  console.log('in loop to see if time not work');
                  console.log('invitee object in for each loop', inviteeObj);
                    User.findOne( { slackId: inviteeObj.slackId }, function ( err, invitee ) {
                      console.log('invitee object found in db', invitee);
                        var auth = getGoogleAuth();
                        auth.credentials = invitee.google;
                        if ( invitee.google.expiry_date < new Date().getTime() ) {
                            auth.refreshAccessToken( function ( err, tokens ) {
                                if ( err ) {
                                    throw new Error( err );
                                } else {
                                    invitee.google = tokens;
                                    invitee.save();
                                }
                            } )
                        }
                        //var weekLater = moment(date).add(7, 'days').format("YYYY-MM-DD")
                        //console.log("datetime", date + 'T' + "05:00:00" + '-00:01')
                        calendar.freebusy.query({
                            auth: auth,
                            resource: {
                                timeMin: date + 'T' + time + '-07:00',
                                timeMax: date + 'T' + time30 + '-07:00',
                                timeZone: 'America/Los_Angeles',
                                items: [{id: inviteeObj.email}]
                            }
                        }, function(err, response){
                            if(err){
                                throw new Error(err);
                            }
                            console.log("busy obj", response.calendars[inviteeObj.email].busy)
                            if(response.calendars[inviteeObj.email].busy.length !== 0){
                                hasConflicts = true;
                                // console.log('calendar', response.calendars[inviteeObj.email]);
                                // console.log("i'm here in the if statement");
                                busyIntervals = []
                                people.forEach( function ( inviteeObj ) {
                                    User.findOne( { slackId: inviteeObj.slackId }, function ( err, invitee ) {
                                        var auth = getGoogleAuth();
                                        auth.credentials = invitee.google;
                                        if ( invitee.google.expiry_date < new Date().getTime() ) {
                                            auth.refreshAccessToken( function ( err, tokens ) {
                                                if ( err ) {
                                                    throw new Error( err );
                                                } else {
                                                    invitee.google = tokens;
                                                    invitee.save();
                                                }
                                            } )
                                        }
                                        var weekLater = moment(date).add(7, 'days').format("YYYY-MM-DD")
                                        //console.log("datetime", date + 'T' + "05:00:00" + '-00:01')
                                        calendar.freebusy.query({
                                            auth: auth,
                                            resource: {
                                                timeMin: date + 'T' + "05:00:00" + '-07:00',
                                                timeMax: weekLater + 'T' + "23:59:59" + '-07:00',
                                                timeZone: 'America/Los_Angeles',
                                                items: [{id: inviteeObj.email}]
                                            }
                                        }, function(err, response){
                                            if(err){
                                                throw new Error(err);
                                            }
                                            if(response.calendars[inviteeObj.email].busy.length !== 0){
                                                busyIntervals = busyIntervals.concat(response.calendars[inviteeObj.email].busy);
                                            }
                                            //busyIntervals.push(response.calendars[inviteeObj.email].busy)
                                        //console.log("freeBusy response", response.calendars['jklugher@wellesley.edu'].busy)
                                        })
                                    } )
                                })
                                web.chat.postMessage( payload.channel.id, 'Oh No! There is a conflict! :(', conflictMenuTest);
                                res.end();
                            } else if (!hasConflicts && idx === people.length - 1) {
                              var emailArr = people.map(function(obj){
                                return {email: obj.email}
                              });
                              var event = {
                                summary: people.length === 0 ? `meeting with ${ people }${ subject ? ( ': ' + subject ) : '' }` : subject,
                                description: people.length === 0 ? `meeting with ${ people }${ subject ? ( ': ' + subject ) : '' }` : subject,
                                start: {
                                  dateTime: time ? ( date + 'T' + time + '-07:00' ) : ( date + "T5:00:00-07:00" ),
                                  timeZone: "Europe/Paris"
                                },
                                end: {
                                  dateTime: time ? ( date + 'T' + time30 + '-07:00' ) : ( date + "T23:59:00-07:00" ),
                                  timeZone: "Europe/Paris"
                                },
                                attendees: emailArr
                              }
                              // console.log('event start time', event.start.dateTime);
                              var auth = getGoogleAuth();
                              auth.credentials = user.google;
                              if ( user.google.expiry_date < new Date().getTime() ) {
                                auth.refreshAccessToken( function ( err, tokens ) {
                                  if ( err ) {
                                    throw new Error( err );
                                  } else {
                                    user.google = tokens;
                                    user.save();
                                  }
                                } )
                              }

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
                              user.pendingInfo = {}
                              user.save()
                              res.send( 'Creating event! :fire: ' );
                            }
                            //busyIntervals.push(response.calendars[inviteeObj.email].busy)
                        //console.log("freeBusy response", response.calendars['jklugher@wellesley.edu'].busy)
                        })
                    } )
                })
            }
        } )
    } else {
        res.send( 'Cancelled :x:' )
    }
  }
} );

var conflictMenuTest = {
  "text": "Resolve conflict.",
  "response_type": "in_channel",
  "attachments": [
    {
        "text": "Choose a time",
        "fallback": "If you could read this message, you'd be choosing something fun to do right now.",
        "color": "#3AA3E3",
        "attachment_type": "default",
        "callback_id": "conflict_resolution",
        "actions": [
            {
                "name": "times_list",
                "text": "Available times...",
                "type": "select",
                "options": [
                    {
                        "text": `test`,
                        "value": `test`
                    },
                    {
                        "text": `test`,
                        "value": `test`
                    },
                    {
                        "text": `test`,
                        "value": `test`
                    }
                ]
            }
        ]
    }
  ]
}

// var conflictMenu = {
//   "text": "Resolve conflict.",
//   "response_type": "in_channel",
//   "attachments": [
//     {
//         "text": "Choose a time",
//         "fallback": "If you could read this message, you'd be choosing something fun to do right now.",
//         "color": "#3AA3E3",
//         "attachment_type": "default",
//         "callback_id": "conflict_resolution",
//         "actions": [
//             {
//                 "name": "times_list",
//                 "text": "Available times...",
//                 "type": "select",
//                 "options": [
//                     {
//                         "text": `${parsedTimes[0]}`,
//                         "value": `${times[0]}`
//                     },
//                     {
//                         "text": `${parsedTimes[1]}`,
//                         "value": `${times[1]}`
//                     },
//                     {
//                         "text": `${parsedTimes[2]}`,
//                         "value": `${times[2]}`
//                     },
//                     {
//                         "text": `${parsedTimes[3]}`,
//                         "value": `${times[3]}`
//                     },
//                     {
//                         "text": `${parsedTimes[4]}`,
//                         "value": `${times[4]}`
//                     },
//                     {
//                         "text": `${parsedTimes[5]}`,
//                         "value": `${times[5]}`
//                     },
//                     {
//                         "text": `${parsedTimes[6])}`,
//                         "value": `${times[6]}`
//                     },
//                     {
//                         "text": `${parsedTimes[7]}`,
//                         "value": `${times[7]}`
//                     },
//                     {
//                         "text": `${parsedTimes[8]}`,
//                         "value": `${times[8]}`
//                     },
//                     {
//                         "text": `${parsedTimes[9]}`,
//                         "value": `${times[9]}`
//                     }
//                 ]
//             }
//         ]
//     }
//   ]
// }


var port = process.env.PORT || 3000;
app.listen( port );
