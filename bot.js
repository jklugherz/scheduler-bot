var { RtmClient, WebClient, CLIENT_EVENTS, RTM_EVENTS } = require( '@slack/client' );
var axios = require( 'axios' );
var { User, Reminder } = require('./models');

var bot_token = process.env.SLACK_BOT_TOKEN || '';
var web = new WebClient( bot_token );
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
    rtm.sendMessage( 'Planner Khaleesi active!', channel );
    
    var today = new Date();
    //var arr = []
    Reminder.find({date: today}, function(err, rems){
      if(err){
        throw new Error("err")
      }
      else{
        rems.forEach(function(item){
          var dm = rtm.dataStore.getDMByUserId( item.userId );
          rtm.sendMessage( `you have to ${item.subject} today`, dm.id);
        })
      }
      //arr.concat(rems)
    })
    Reminder.remove({date: today});
    
    var tomorrow = new Date();
    tomorrow.setDate(today.getDate()+1);
    
    Reminder.find({date: tomorrow}, function(err, rems){
      if(err){
        throw new Error("err")
      }
      rems.forEach(function(item){
          var dm = rtm.dataStore.getDMByUserId( item.userId );
          rtm.sendMessage( `you have to ${item.subject} tomorrow`, dm.id);
        })
      //arr.concat(rems)
    })

} );

rtm.on( RTM_EVENTS.MESSAGE, ( msg ) => {
    var dm = rtm.dataStore.getDMByUserId( msg.user );
    if ( !dm || dm.id !== msg.channel || msg.type !== 'message' ) {
        console.log( 'message not sent to dm, ignoring' );
        return;
    } else if ( /*TODO: If user not signed in send authenticatino link*/ true ) {
        rtm.sendMessage( process.env.DOMAIN + '/connect?auth_id=' + msg.user, msg.channel );
    } else {
        // rtm.sendMessage(msg.text, msg.channel);
        console.log( 'msg', msg );
        User.findOne({ slackId: msg.user })
        .then(function(user) {
          if (!user) {
            return new User({
              slackId: msg.user,
              slackDmID: msg.channel
            });
          }
          retrun user;
        });
        .then(function(user) {
          console.log('USER IS', user);
          if (!user.google) { //user did not already set up google connection yet
            rtm.sendMessage(`Hello,
              This is Planner Khaleesi. In order to schedule reminders for you,
              I need access to your Google calendar.

              Please visit ${process.env.DOMAIN}/connect?user=${user._id} to setup Google Calendar`, msg.channel);
          }
          axios.get( 'https://api.api.ai/api/query', {
              params: {
                  v: 20150910,
                  lang: 'en',
                  timezone: '2017-07-17T16:55:52-0700',
                  query: msg.text,
                  sessionId: msg.user
              },
              headers: {
                  Authorization: `Bearer ${ process.env.API_AI_TOKEN }`
              }
          } )
              .then(( { data } ) => {
                  console.log( 'data', data );
                  if ( data.result.actionIncomplete ) {
                      rtm.sendMessage( data.result.fulfillment.speech, msg.channel );
                  } else {
                            //have to check if intentName is Reminder or Meeting
                            if(data.metadata.intentName === "Reminder"){
                              var rem = new Reminder({
                                subject: data.result.parameters.subject,
                                date: new Date(data.result.parameters.date), 
                                userId: msg.user
                              })
                              rem.save();
                              web.chat.postMessage(msg.channel,
                                `Creating reminder for '${data.result.parameters.subject}' on ${data.result.parameters.date}`,
                                {
                                  "attachments": [
                                  {
                                    "fallback": `${data.result.parameters.subject}%` + `${data.result.parameters.date}`,
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
                            if(data.metadata.intentName === "Meetings"){
                              web.chat.postMessage(msg.channel,
                                `Creating meeting with '${data.result.parameters.people}' on ${data.result.parameters.date} at ${data.result.parameters.time}: ${data.result.parameters.subject}`,
                                {
                                  "attachments": [
                                  {
                                    "fallback": `${data.result.parameters.subject}%` + `${data.result.parameters.date}%` + `${data.result.parameters.time}%`  + `${data.result.parameters.subject}`,
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
                  }
              } )
              .catch( err => {
                  console.log( 'error', err );
              } )
        });
    }
} );

rtm.start();

module.exports = {
  rtm
}
