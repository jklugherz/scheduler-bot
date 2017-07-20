var { RtmClient, WebClient, CLIENT_EVENTS, RTM_EVENTS } = require( '@slack/client' );
var axios = require( 'axios' );
var { User, Reminder } = require( './models' );

var bot_token = process.env.SLACK_BOT_TOKEN || '';
var web = new WebClient( bot_token );
var rtm = new RtmClient( bot_token );
var moment = require( 'moment' );

let channel;
var pendingUsers = [];

// The client will emit an RTM.AUTHENTICATED event on successful connection, with the `rtm.start` payload
rtm.on( CLIENT_EVENTS.RTM.AUTHENTICATED, ( rtmStartData ) => {
    for ( const c of rtmStartData.channels ) {
        if ( c.is_member && c.name === 'general' ) { channel = c.id }
    }
    console.log( `Logged in as ${ rtmStartData.self.name } of team ${ rtmStartData.team.name }, but not yet connected to a channel` );
} );

function checkReminders() {
    //test plz ignore
    var today = moment().format( "YYYY-MM-DD" );
    //console.log( today )
    Reminder.find( { date: today }, function ( err, rems ) {
        if ( err ) {
            throw new Error( "err" )
        }
        else {
            if ( rems.length !== 0 ) {
                rems.forEach( function ( item ) {
                    var dm = rtm.dataStore.getDMByUserId( item.userId );
                    rtm.sendMessage( `you have to ${ item.subject } today`, dm.id );
                    console.log( 'Message sent to ', dm.id, item.subject )
                } )
            }

        }
    } )
    Reminder.remove( { date: today }, function ( err ) {
        if ( err ) {
            console.log( 'err', err );
        }
        else {
            console.log( "reminders were removed" )
        }
    } );

    var tomorrow = moment().add( 'days', 1 ).format( "YYYY-MM-DD" );

    Reminder.find( { date: tomorrow }, function ( err, rems ) {
        if ( err ) {
            throw new Error( "err" )
        }
        if ( rems.length !== 0 ) {
            rems.forEach( function ( item ) {
                var dm = rtm.dataStore.getDMByUserId( item.userId );
                rtm.sendMessage( `you have to ${ item.subject } tomorrow`, dm.id );
                console.log( 'Message sent to ', dm.id, item.subject )
            } )
        }
    } )
}

// you need to wait for the client to fully connect before you can send messages
rtm.on( CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function () {
    rtm.sendMessage( 'Planner Khaleesi active!', channel );
    checkReminders();
    setInterval( checkReminders, 43200000 )
} );

rtm.on( RTM_EVENTS.MESSAGE, ( msg ) => {
    var dm = rtm.dataStore.getDMByUserId( msg.user );
    if ( !dm || dm.id !== msg.channel || msg.type !== 'message' ) {
        return;
    } else {
        User.findOne( { slackId: msg.user } )
            .then( function ( user ) {
                if ( !user ) {
                    return new User( {
                        slackId: msg.user,
                        slackDmId: msg.channel
                    } ).save();
                }
                return user;
            } )
            .then( function ( user ) {
                if ( !user.google ) { //user did not already set up google connection yet
                    rtm.sendMessage( `Hello,
                        This is Planner Khaleesi. In order to schedule reminders for you,
                        I need access to your Google calendar.

                        Please visit ${process.env.DOMAIN }/connect?user=${ user._id } to setup Google Calendar`
                        , msg.channel );
                } else {
                    if ( pendingUsers.includes( user.slackId ) ) {
                        rtm.sendMessage( 'You need to confirm or cancel your request', msg.channel )
                    }
                    else {
                        let tempMsg = msg.text;
                        if ( tempMsg.includes( '<@' ) ) {
                            let textArr = tempMsg.split( ' ' );
                            textArr = textArr.map( function ( word ) {
                                if ( word.includes( '<@' ) ) {
                                    const u = rtm.dataStore.getUserById(word.slice( 2, word.length - 1 ));
                                    return u;
                                } else { return word }
                            } )
                            tempMsg = textArr.join( ' ' );
                            console.log( tempMsg );
                        }
                        axios.get( 'https://api.api.ai/api/query', {
                            params: {
                                v: 20150910,
                                lang: 'en',
                                timezone: '2017-07-17T16:55:52-0700',
                                query: tempMsg,
                                sessionId: msg.user
                            },
                            headers: {
                                Authorization: `Bearer ${ process.env.API_AI_TOKEN }`
                            }
                        } )
                            .then(( { data } ) => {
                                if ( data.result.actionIncomplete ) {
                                    rtm.sendMessage( data.result.fulfillment.speech, msg.channel );
                                } else {
                                    pendingUsers.push( user.slackId );
                                    var messageString = data.result.parameters.people ? `Scheduling meeting with ${ data.result.parameters.people } on ${ data.result.parameters.date } at ${ data.result.parameters.time } ${ data.result.parameters.subject ? ( ': ' + data.result.parameters.subject ) : '' }` : `Creating reminder for '${ data.result.parameters.subject }' on ${ data.result.parameters.date }`
                                    web.chat.postMessage( msg.channel,
                                        messageString,
                                        {
                                            "attachments": [
                                                {
                                                    "fallback": data.result.parameters.people ? ( `${ data.result.parameters.subject ? ( data.result.parameters.subject ) : '' }%` + `${ data.result.parameters.date }%` + `${ msg.user }%` + `${ data.result.parameters.time }%` + `${ data.result.parameters.people }%` ) : ( `${ data.result.parameters.subject }%` + `${ data.result.parameters.date }%` + `${ msg.user }` ),
                                                    "callback_id": "reminder",
                                                    "color": "#3AA3E3",
                                                    "attachment_type": "default",
                                                    "actions": [
                                                        {
                                                            "name": "confirm",
                                                            "text": "Confirm",
                                                            "type": "button",
                                                            "value": "true"
                                                        },
                                                        {
                                                            "name": "cancel",
                                                            "text": "Cancel",
                                                            "type": "button",
                                                            "value": "false"
                                                        }
                                                    ]
                                                }
                                            ]
                                        }
                                    );
                                }
                            } );
                    }
                }
            } ).catch( err => {
                console.log( 'error', err );
            } );
    }
} );

rtm.start();

module.exports = {
    rtm,
    pendingUsers
}
