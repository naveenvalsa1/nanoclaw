#!/usr/bin/env node

/**
 * Make an interactive call with two-way conversation
 *
 * Usage: node make-interactive-call.js <phone-number> <purpose>
 * Example: node make-interactive-call.js +919840882260 "Book a table for 4 at Peshawari restaurant for 8 PM tonight"
 */

const fs = require('fs');
const path = require('path');
const twilio = require('twilio');

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'twilio-config.json'), 'utf8'));

// Initialize Twilio client
const client = twilio(config.account_sid, config.auth_token);

/**
 * Make an interactive call
 */
async function makeInteractiveCall(phoneNumber, purpose, webhookUrl) {
    try {
        console.log(`📞 Initiating interactive call...`);
        console.log(`   To: ${phoneNumber}`);
        console.log(`   Purpose: ${purpose}`);
        console.log(`   Using webhook: ${webhookUrl || 'LOCAL (needs ngrok)'}`);

        // For now, use TwiML Bins or provide webhook URL
        // This is a simplified version that needs webhook server running

        // URL encode the purpose to pass it through webhooks
        const encodedPurpose = encodeURIComponent(purpose);

        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="${webhookUrl}/voice/process?purpose=${encodedPurpose}" timeout="5" speechTimeout="auto" bargeIn="true">
        <Say voice="${config.voice}" language="${config.language}">
            Hi! This is Andy, calling from Naveen Valsakumar's office. ${purpose}. So, what do you think?
        </Say>
    </Gather>
    <Say voice="${config.voice}" language="${config.language}">
        I didn't hear anything. Feel free to call back when you're ready. Goodbye!
    </Say>
</Response>`;

        const call = await client.calls.create({
            from: config.phone_number,
            to: phoneNumber,
            twiml: twiml,
            record: config.recording_enabled,
            recordingStatusCallback: webhookUrl ? `${webhookUrl}/recording/status` : undefined
        });

        console.log(`\n✅ Call initiated successfully!`);
        console.log(`   Call SID: ${call.sid}`);
        console.log(`   Status: ${call.status}`);
        console.log(`\n⚠️  NOTE: Full interactive calling requires webhook server to be running`);
        console.log(`   Run: node interactive-call-server.js`);
        console.log(`   And expose via ngrok: ngrok http 3000`);

        return {
            success: true,
            callSid: call.sid,
            phoneNumber: phoneNumber,
            purpose: purpose
        };

    } catch (error) {
        console.error(`\n❌ Error making call:`, error.message);
        throw error;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);

    if (args.length < 2) {
        console.log('Usage: node make-interactive-call.js <phone-number> <purpose> [webhook-url]');
        console.log('\nExamples:');
        console.log('  node make-interactive-call.js +919840882260 "Book a table for 4"');
        console.log('  node make-interactive-call.js +919840882260 "Check if they have the item in stock" https://your-ngrok-url.ngrok.io');
        process.exit(1);
    }

    const phoneNumber = args[0];
    const purpose = args[1];
    const webhookUrl = args[2] || null;

    makeInteractiveCall(phoneNumber, purpose, webhookUrl)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { makeInteractiveCall };
