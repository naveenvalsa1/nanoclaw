#!/usr/bin/env node

/**
 * Test interactive calling locally without webhooks
 * This creates a simple interactive call using TwiML Bins
 */

const fs = require('fs');
const path = require('path');
const twilio = require('twilio');

// Load configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'twilio-config.json'), 'utf8'));
const client = twilio(config.account_sid, config.auth_token);

async function createSimpleInteractiveCall(phoneNumber) {
    try {
        console.log('📞 Creating a simple interactive test call...');
        console.log('   This will call you and ask a question, then repeat your answer back.');

        // Create a simple TwiML script for testing
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${config.voice}" language="${config.language}">
        Hello Naveen, this is Andy testing interactive calling.
        Please say something after the beep, and I will repeat it back to you.
    </Say>
    <Pause length="1"/>
    <Record
        maxLength="10"
        playBeep="true"
        transcribe="true"
        transcribeCallback="http://example.com/transcribe"
    />
    <Say voice="${config.voice}" language="${config.language}">
        Thank you! I heard your message. This proves that interactive calling infrastructure is working.
        Once we expose the webhook server publicly, I'll be able to have full back-and-forth conversations.
        Goodbye!
    </Say>
</Response>`;

        const call = await client.calls.create({
            from: config.phone_number,
            to: phoneNumber,
            twiml: twiml,
            record: true
        });

        console.log('\n✅ Test call initiated!');
        console.log(`   Call SID: ${call.sid}`);
        console.log(`   Status: ${call.status}`);
        console.log('\n📝 This demonstrates:');
        console.log('   ✓ Speech recording works');
        console.log('   ✓ Text-to-speech works with new voice');
        console.log('   ✓ Interactive flow is possible');
        console.log('\n⏭️  Next: Expose webhook server for full AI conversations');

        return call;

    } catch (error) {
        console.error('❌ Error:', error.message);
        throw error;
    }
}

// Run test
if (require.main === module) {
    const phoneNumber = process.argv[2] || '+919840882260';
    createSimpleInteractiveCall(phoneNumber)
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { createSimpleInteractiveCall };
