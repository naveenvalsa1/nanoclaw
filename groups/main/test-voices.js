#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const twilio = require('twilio');

// Load Twilio configuration
const configPath = path.join(__dirname, 'twilio-config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

// Initialize Twilio client
const client = twilio(config.account_sid, config.auth_token);

const voices = [
    { name: 'Polly.Aditi-Neural', language: 'en-IN', description: 'Indian English - Clear and professional' },
    { name: 'Polly.Joanna-Neural', language: 'en-US', description: 'US English - Very natural and warm' },
    { name: 'Polly.Matthew-Neural', language: 'en-US', description: 'US English - Professional male voice' },
    { name: 'Polly.Ruth-Neural', language: 'en-US', description: 'US English - Friendly female voice' }
];

async function testVoice(voiceName, language, description, phoneNumber) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="${voiceName}" language="${language}">
        Hello Naveen. This is voice sample number ${voices.findIndex(v => v.name === voiceName) + 1}.
        ${description}.
        I'm calling to demonstrate how this voice sounds for your Andy assistant.
        Let me know if you like this one!
    </Say>
</Response>`;

    try {
        const call = await client.calls.create({
            from: config.phone_number,
            to: phoneNumber,
            twiml: twiml
        });

        console.log(`✅ Test call ${voices.findIndex(v => v.name === voiceName) + 1} initiated: ${voiceName}`);
        console.log(`   Call SID: ${call.sid}`);
        return call.sid;
    } catch (error) {
        console.error(`❌ Error testing voice ${voiceName}:`, error.message);
        throw error;
    }
}

async function testAllVoices(phoneNumber) {
    console.log(`📞 Testing ${voices.length} different voices...`);
    console.log(`   Calling: ${phoneNumber}\n`);

    for (let i = 0; i < voices.length; i++) {
        const voice = voices[i];
        console.log(`\n🎙️  Voice ${i + 1}/${voices.length}: ${voice.name}`);
        console.log(`   ${voice.description}`);

        await testVoice(voice.name, voice.language, voice.description, phoneNumber);

        // Wait 30 seconds between calls so you can hear each one
        if (i < voices.length - 1) {
            console.log(`   ⏳ Waiting 30 seconds before next call...\n`);
            await new Promise(resolve => setTimeout(resolve, 30000));
        }
    }

    console.log('\n\n✅ All voice tests completed!');
    console.log('Let me know which number you prefer (1-4)');
}

// CLI usage
if (require.main === module) {
    const phoneNumber = process.argv[2];

    if (!phoneNumber) {
        console.log('Usage: node test-voices.js <phone-number>');
        console.log('Example: node test-voices.js +919840882260');
        process.exit(1);
    }

    testAllVoices(phoneNumber)
        .then(() => process.exit(0))
        .catch(error => {
            console.error('\n❌ Failed:', error.message);
            process.exit(1);
        });
}

module.exports = { testAllVoices };
