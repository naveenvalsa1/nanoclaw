#!/usr/bin/env node

/**
 * Interactive Two-Way Calling Server
 *
 * This server handles Twilio webhooks for interactive phone conversations.
 * It enables Andy to have real-time back-and-forth conversations during calls.
 */

const express = require('express');
const bodyParser = require('body-parser');
const twilio = require('twilio');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

// Configuration
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'twilio-config.json'), 'utf8'));
const PORT = process.env.PORT || 3000;

// Initialize Express app
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Initialize Anthropic client (supports both API key and OAuth token)
const anthropic = process.env.ANTHROPIC_API_KEY
    ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    : new Anthropic({ authToken: process.env.ANTHROPIC_AUTH_TOKEN || process.env.CLAUDE_CODE_OAUTH_TOKEN });

// Store active conversations
const conversations = new Map();

/**
 * Call status tracking
 */
class CallContext {
    constructor(callSid, purpose) {
        this.callSid = callSid;
        this.purpose = purpose;
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

    getConversationHistory() {
        return this.transcript.map(msg => ({
            role: msg.role === 'andy' ? 'assistant' : 'user',
            content: msg.content
        }));
    }
}

/**
 * Convert text to SSML for more natural speech
 */
function textToSSML(text) {
    // Add natural pauses after commas and periods
    let ssml = text
        // Add short pause after commas
        .replace(/,/g, ',<break time="300ms"/>')
        // Add medium pause after periods (but not in abbreviations)
        .replace(/\. /g, '.<break time="500ms"/> ')
        // Add emphasis on important words
        .replace(/\b(important|critical|urgent|definitely|absolutely)\b/gi, '<emphasis level="strong">$1</emphasis>')
        // Slow down numbers and times
        .replace(/\b(\d+:\d+\s*(am|pm|AM|PM))\b/g, '<prosody rate="slow">$1</prosody>')
        .replace(/\b(\d+\s*(dollars|rupees|minutes|hours|days))\b/gi, '<prosody rate="slow">$1</prosody>');

    return `<speak>${ssml}</speak>`;
}

/**
 * Generate AI response based on conversation context
 */
async function generateResponse(callContext, userInput) {
    try {
        const systemPrompt = `You are Andy, Naveen Valsakumar's executive assistant. You're making a phone call on his behalf.

CALL OBJECTIVE: ${callContext.purpose}

YOUR PERSONALITY & SPEAKING STYLE:
- Professional yet warm and personable
- Efficient - get to the point quickly
- Excellent listener - pick up on context and details
- Adaptable - match the other person's communication style
- Action-oriented - focus on next steps and outcomes
- **SPEAK NATURALLY**: Use contractions (I'm, don't, can't, we'll), conversational language
- Add natural fillers occasionally: "well", "you know", "so", "right"
- Vary sentence length - mix short and medium sentences

CONVERSATION RULES:
1. **STAY LASER-FOCUSED ON THE CALL OBJECTIVE ABOVE** - Everything you say should advance that goal
2. Keep responses SHORT (1-3 sentences). Phone conversations should be concise.
3. If asked to repeat or clarify, restate the CALL OBJECTIVE clearly
4. Listen more than you talk - extract key information from what they say
5. If they ask you to do something, confirm you'll relay it to Naveen
6. If they speak in mixed languages or with accents, be understanding and patient
7. Don't fall back to generic small talk - always relate responses to the OBJECTIVE
8. When the objective is complete, end gracefully with "I'll let Naveen know" or similar

ENDING THE CALL:
- End when: objective complete, they say goodbye/bye/thanks, or they're clearly busy
- Use natural endings: "Perfect, I'll let Naveen know!", "Great, thanks for your time!", "Understood, I'll update Naveen. Have a good one!"

CONTEXT FROM THIS CALL:
${callContext.transcript.slice(-6).map(msg => `${msg.role === 'andy' ? 'You' : 'Them'}: ${msg.content}`).join('\n')}

THEY JUST SAID: "${userInput}"

Respond naturally as Andy. Be helpful and efficient.`;

        const message = await anthropic.messages.create({
            model: 'claude-sonnet-4-5-20250929',
            max_tokens: 150,
            temperature: 0.7,
            messages: [
                {
                    role: 'user',
                    content: systemPrompt
                }
            ]
        });

        return message.content[0].text;
    } catch (error) {
        console.error('Error generating AI response:', error);
        return "I apologize, I'm having trouble processing that. Could you please repeat?";
    }
}

/**
 * Main webhook endpoint for call initiation
 */
app.post('/voice/incoming', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;

    console.log(`📞 Incoming call: ${callSid}`);

    // Build absolute URL for callbacks
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    // Gather user response with barge-in (Say must be INSIDE Gather for interruption to work)
    const gather = twiml.gather({
        input: 'speech',
        action: `${baseUrl}/voice/process`,
        method: 'POST',
        speechTimeout: 'auto',
        language: config.language,
        bargeIn: true  // Allow user to interrupt
    });

    // Initial greeting (nested inside Gather so caller can interrupt)
    gather.say({
        voice: config.voice,
        language: config.language
    }, 'Hello! This is Andy calling. How can I help you today?');

    // If no response, repeat
    twiml.say({
        voice: config.voice,
        language: config.language
    }, 'I didn\'t hear anything. Please call back when you\'re ready.');

    res.type('text/xml');
    res.send(twiml.toString());
});

/**
 * Process speech input and continue conversation
 */
app.post('/voice/process', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;
    const speechResult = req.body.SpeechResult;
    const purpose = req.query.purpose || 'General conversation';

    console.log(`🗣️  Speech input [${callSid}]: "${speechResult}"`);

    // Get or create call context
    let callContext = conversations.get(callSid);
    if (!callContext) {
        callContext = new CallContext(callSid, purpose);
        conversations.set(callSid, callContext);
    }

    // Add user's speech to transcript
    callContext.addMessage('caller', speechResult);

    // Generate AI response
    const aiResponse = await generateResponse(callContext, speechResult);
    callContext.addMessage('andy', aiResponse);

    console.log(`🤖 Andy response: "${aiResponse}"`);

    // Check if we should end the call - look for natural ending phrases
    const endingPhrases = [
        'goodbye', 'bye', 'take care', 'have a great', 'have a good',
        "i'll let naveen know", "i'll update naveen", "thanks for your time",
        'talk to you later', 'speak soon', 'catch you later'
    ];
    const shouldEndCall = endingPhrases.some(phrase =>
        aiResponse.toLowerCase().includes(phrase)
    ) || speechResult.toLowerCase().includes('bye');

    if (shouldEndCall) {
        // Speak the response then hang up (no need for barge-in on farewell)
        twiml.say({
            voice: config.voice,
            language: config.language
        }, aiResponse);
        twiml.hangup();
        console.log(`📴 Call ended: ${callSid}`);

        // Save transcript
        saveTranscript(callContext);
    } else {
        // Build absolute URL for callbacks
        const protocol = req.headers['x-forwarded-proto'] || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        const baseUrl = `${protocol}://${host}`;

        // Pass purpose through to next gather
        const encodedPurpose = encodeURIComponent(callContext.purpose);

        // Say INSIDE Gather so caller can interrupt mid-sentence (barge-in)
        const gather = twiml.gather({
            input: 'speech',
            action: `${baseUrl}/voice/process?purpose=${encodedPurpose}`,
            method: 'POST',
            speechTimeout: 'auto',
            language: config.language,
            bargeIn: true  // Allow user to interrupt
        });

        gather.say({
            voice: config.voice,
            language: config.language
        }, aiResponse);
    }

    res.type('text/xml');
    res.send(twiml.toString());
});

/**
 * Make an outbound interactive call
 */
app.post('/call/make', async (req, res) => {
    const { to, purpose } = req.body;

    if (!to) {
        return res.status(400).json({ error: 'Phone number required' });
    }

    const client = twilio(config.account_sid, config.auth_token);

    try {
        const call = await client.calls.create({
            from: config.phone_number,
            to: to,
            url: `http://your-public-url/voice/outbound?purpose=${encodeURIComponent(purpose || 'General call')}`,
            record: config.recording_enabled,
            statusCallback: `/call/status`,
            statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
        });

        console.log(`✅ Outbound call initiated: ${call.sid}`);

        res.json({
            success: true,
            callSid: call.sid,
            to: to,
            purpose: purpose
        });
    } catch (error) {
        console.error('Error making call:', error);
        res.status(500).json({ error: error.message });
    }
});

/**
 * Outbound call webhook
 */
app.post('/voice/outbound', async (req, res) => {
    const twiml = new twilio.twiml.VoiceResponse();
    const callSid = req.body.CallSid;
    const purpose = req.query.purpose || 'General call';

    console.log(`📞 Outbound call answered: ${callSid}`);
    console.log(`📋 Purpose: ${purpose}`);

    // Create call context
    const callContext = new CallContext(callSid, purpose);
    conversations.set(callSid, callContext);

    // Generate opening statement based on purpose
    const openingMessage = await generateOpeningMessage(purpose);
    callContext.addMessage('andy', openingMessage);

    // Say INSIDE Gather so callee can interrupt mid-sentence (barge-in)
    const gather = twiml.gather({
        input: 'speech',
        action: '/voice/process',
        method: 'POST',
        speechTimeout: 'auto',
        language: config.language,
        bargeIn: true  // Allow user to interrupt
    });

    gather.say({
        voice: config.voice,
        language: config.language
    }, openingMessage);

    res.type('text/xml');
    res.send(twiml.toString());
});

/**
 * Generate context-appropriate opening message
 */
async function generateOpeningMessage(purpose) {
    const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 100,
        messages: [{
            role: 'user',
            content: `You are Andy, an AI assistant making a phone call for Naveen Valsakumar.

Call purpose: ${purpose}

Generate a brief, natural opening statement (1-2 sentences) to start the call professionally.`
        }]
    });

    return message.content[0].text;
}

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
 * Save call transcript
 */
function saveTranscript(callContext) {
    const filename = `call-transcript-${callContext.callSid}-${Date.now()}.json`;
    const filepath = path.join(__dirname, 'call-transcripts', filename);

    // Create directory if it doesn't exist
    const dir = path.dirname(filepath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

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
 * Health check endpoint
 */
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        activeConversations: conversations.size,
        uptime: process.uptime()
    });
});

/**
 * Start server
 */
app.listen(PORT, () => {
    console.log(`🚀 Interactive calling server running on port ${PORT}`);
    console.log(`📞 Webhook URL: http://your-public-url:${PORT}/voice/incoming`);
    console.log(`💡 Use ngrok or similar to expose this server to the internet`);
});

module.exports = app;
