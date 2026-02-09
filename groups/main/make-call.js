#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const twilio = require('twilio');

// Load Twilio configuration
const configPath = path.join(__dirname, 'twilio-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Twilio client
const client = twilio(config.account_sid, config.auth_token);

/**
 * Make a phone call using Twilio
 * @param {string} to - Phone number to call (E.164 format, e.g., +919876543210)
 * @param {string} message - Message to speak during the call
 * @returns {Promise} - Call details
 */
async function makeCall(to, message) {
    try {
        console.log(`📞 Initiating call to ${to}...`);
        console.log(`💬 Message: "${message}"`);

        // Create TwiML for the call
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${config.voice}" language="${config.language}">${escapeXml(message)}</Say>
    <Pause length="2"/>
    <Say voice="${config.voice}" language="${config.language}">Thank you. Goodbye.</Say>
</Response>`;

        // Make the call
        const call = await client.calls.create({
            from: config.phone_number,
            to: to,
            twiml: twiml,
            record: config.recording_enabled,
            recordingStatusCallback: config.recording_enabled ? `http://your-webhook-url/recording-status` : undefined,
            statusCallback: `http://your-webhook-url/call-status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        });

        console.log(`✅ Call initiated successfully!`);
        console.log(`📋 Call SID: ${call.sid}`);
        console.log(`📊 Status: ${call.status}`);
        console.log(`🔗 To: ${call.to}`);
        console.log(`📱 From: ${call.from}`);

        return {
            success: true,
            callSid: call.sid,
            status: call.status,
            to: call.to,
            from: call.from,
            message: message
        };

    } catch (error) {
        console.error(`❌ Error making call:`, error.message);

        if (error.code === 21614) {
            console.error(`\n⚠️  This is a trial account. You can only call verified numbers.`);
            console.error(`   Go to Twilio Console > Phone Numbers > Verified Caller IDs`);
            console.error(`   and verify the number you want to call: ${to}`);
        }

        throw error;
    }
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe) {
    return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case '<': return '&lt;';
            case '>': return '&gt;';
            case '&': return '&amp;';
            case '\'': return '&apos;';
            case '"': return '&quot;';
        }
    });
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node make-call.js <phone-number> <message>');
        console.log('Example: node make-call.js +919876543210 "Hello, this is a test call from Andy"');
        process.exit(1);
    }

    const phoneNumber = args[0];
    const message = args.slice(1).join(' ');

    makeCall(phoneNumber, message)
        .then(result => {
            console.log('\n✅ Call completed successfully!');
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ Call failed!');
            process.exit(1);
        });
}

module.exports = { makeCall };
