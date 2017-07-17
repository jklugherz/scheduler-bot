var express = require( 'express' );
var session = require( 'express-session' );
var path = require( 'path' );
var bodyParser = require( 'body-parser' );

var app = express();

app.use( bodyParser.json() );
app.use( bodyParser.urlencoded( { extended: false } ) );

var RtmClient = require( '@slack/client' ).RtmClient;
var CLIENT_EVENTS = require( '@slack/client' ).CLIENT_EVENTS;
var RTM_EVENTS = require( '@slack/client' ).RTM_EVENTS;

var bot_token = process.env.SLACK_BOT_TOKEN || '';

var rtm = new RtmClient( bot_token );

let channel;

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on( CLIENT_EVENTS.RTM.AUTHENTICATED, ( rtmStartData ) => {
    for ( const c of rtmStartData.channels ) {
        if ( c.is_member && c.name === 'general' ) { channel = c.id }
    }
    console.log( `Logged in as ${ rtmStartData.self.name } of team ${ rtmStartData.team.name }, but not yet connected to a channel` );
} );

// you need to wait for the client to fully connect before you can send messages
rtm.on( CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    rtm.sendMessage( 'Planner King active!', channel );
} );

rtm.on( RTM_EVENTS.MESSAGE, ( message ) => {

} )

rtm.start();
