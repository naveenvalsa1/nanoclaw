const twilio = require('twilio');
const fs = require('fs');
const config = JSON.parse(fs.readFileSync('twilio-config.json', 'utf8'));
const client = twilio(config.account_sid, config.auth_token);

const callSid = 'CA4d4a169d57bcbbad1ebde9dd579778e4';

client.calls(callSid).fetch()
  .then(call => {
    console.log('Call Status:', call.status);
    console.log('Direction:', call.direction);
    console.log('Duration:', call.duration, 'seconds');
    console.log('Start Time:', call.startTime);
    console.log('End Time:', call.endTime);
    console.log('From:', call.from);
    console.log('To:', call.to);
  })
  .catch(err => console.error('Error:', err.message));
