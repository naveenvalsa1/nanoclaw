#!/usr/bin/env node

/**
 * Interactive Two-Way Calling Server - SIMPLE VERSION
 * This version works WITHOUT Anthropic API - uses rule-based responses
 */

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');

// Configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'twilio-config.json'), 'utf8'));
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Store active conversations
const conversations = new Map();

class CallContext {
    constructor(callSid, purpose) {
        this.callSid = callSid;
        this.purpose = purpose || 'General conversation';
        this.transcript = [];
        this.state = 'initiated';
        this.startTime = new Date();
    }

    addMessage(role, content) {
        this.transcript.push({
            role,
            content,
            timestamp: new Date()
        });
    }
}

/**
 * Generate simple rule-based response
 */
function generateSimpleResponse(callContext, userInput) {
    const input = userInput.toLowerCase();

    // Simple pattern matching
    if (input.includes('yes') || input.includes('sure') || input.includes('okay')) {
        return "Great! Thank you for confirming. Is there anything else I can help you with?";
    }

    if (input.includes('no') || input.includes('not') || input.includes("don't")) {
        return "I understand. No problem. Thank you for letting me know.";
    }

    if (input.includes('hello') || input.includes('hi')) {
        return "Hello! I'm Andy, calling on behalf of Naveen. How can I assist you today?";
    }

    if (input.includes('thank')) {
        return "You're very welcome! Have a great day. Goodbye!";
    }

    if (input.includes('bye') || input.includes('goodbye')) {
        return "Goodbye! Have a wonderful day!";
    }

    // Default response based on conversation count
    if (callContext.transcript.length < 4) {
        return "I see. Can you tell me more about that?";
    } else {
        return "Thank you so much for the information. I'll pass this along to Naveen. Have a great day. Goodbye!";
    }
}

/**
 * Main webhook endpoint
 */
app.post('/voice/incoming', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;

    console.log(`📞 Incoming call: ${callSid}`);

    // Build absolute URL
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    // Say INSIDE Gather so caller can interrupt (barge-in)
    const gather = twiml.gather({
        input: 'speech',
        action: `${baseUrl}/voice/process`,
        method: 'POST',
        speechTimeout: 'auto',
        language: config.language,
        bargeIn: true
    });

    gather.say({
        voice: config.voice,
        language: config.language
    }, 'Hello! This is Andy calling. How can I help you today?');

    twiml.say({
        voice: config.voice,
        language: config.language
    }, 'I didn\'t hear anything. Please call back when you\'re ready.');

    res.type('text/xml');
    res.send(twiml.toString());
});

/**
 * Process speech input
 */
app.post('/voice/process', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;
    const speechResult = req.body.SpeechResult;

    console.log(`🗣️  [${callSid}] User said: "${speechResult}"`);

    let callContext = conversations.get(callSid);
    if (!callContext) {
        callContext = new CallContext(callSid, 'General conversation');
        conversations.set(callSid, callContext);
    }

    callContext.addMessage('caller', speechResult);

    // Generate simple response
    const response = generateSimpleResponse(callContext, speechResult);
    callContext.addMessage('andy', response);

    console.log(`🤖 Andy responds: "${response}"`);

    const shouldEndCall = response.toLowerCase().includes('goodbye') ||
                         callContext.transcript.length >= 8;

    if (shouldEndCall) {
        twiml.say({
            voice: config.voice,
            language: config.language
        }, response);
        twiml.hangup();
        console.log(`📴 Call ended: ${callSid}`);
        saveTranscript(callContext);
    } else {
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        // Say INSIDE Gather so caller can interrupt (barge-in)
        const gather = twiml.gather({
            input: 'speech',
            action: `${baseUrl}/voice/process`,
            method: 'POST',
            speechTimeout: 'auto',
            language: config.language,
            bargeIn: true
        });

        gather.say({
            voice: config.voice,
            language: config.language
        }, response);
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

/**
 * Call status webhook
 */
app.post('/call/status', (req, res) => {
    const status = req.body.CallStatus;
    const callSid = req.body.CallSid;

    console.log(`📊 Call ${callSid} status: ${status}`);

    if (status === 'completed') {
        const callContext = conversations.get(callSid);
        if (callContext) {
            saveTranscript(callContext);
            conversations.delete(callSid);
        }
    }

    res.sendStatus(200);
});

/**
 * Save transcript
 */
function saveTranscript(callContext) {
    const filename = `call-transcript-${callContext.callSid}-${Date.now()}.json`;
    const dir = path.join(__dirname, 'call-transcripts');

    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    const filepath = path.join(dir, filename);
    const transcript = {
        callSid: callContext.callSid,
        purpose: callContext.purpose,
        startTime: callContext.startTime,
        endTime: new Date(),
        duration: ((new Date() - callContext.startTime) / 1000).toFixed(0) + ' seconds',
        messages: callContext.transcript
    };

    fs.writeFileSync(filepath, JSON.stringify(transcript, null, 2));
    console.log(`💾 Transcript saved: ${filename}`);
}

/**
 * Health check
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        mode: 'simple',
        activeConversations: conversations.size,
        uptime: process.uptime()
    });
});

/**
 * Start server
 */
app.listen(PORT, () => {
    console.log(`🚀 Interactive calling server (SIMPLE MODE) running on port ${PORT}`);
    console.log(`📞 No Anthropic API needed - using rule-based responses`);
    console.log(`💡 Use ngrok to expose: ngrok http ${PORT}`);
});

module.exports = app;
