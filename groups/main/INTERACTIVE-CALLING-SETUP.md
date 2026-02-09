# Interactive Two-Way Calling Setup Guide

## Overview

This system enables Andy to have **real-time back-and-forth conversations** during phone calls, not just speak pre-written messages.

## How It Works

```
You → Request call → Andy calls → Person answers →
Andy speaks → Person responds → Andy listens →
Andy processes response → Andy replies → Repeat →
Call ends → Andy reports back with transcript
```

## Components Built

### 1. **Interactive Call Server** (`interactive-call-server.js`)
- Express webhook server
- Handles Twilio callbacks in real-time
- Processes speech-to-text
- Generates AI responses using Claude
- Manages conversation state
- Saves call transcripts

### 2. **Call Client** (`make-interactive-call.js`)
- Initiates interactive calls
- Provides call purpose/context
- Simplified interface

## Setup Required

### Step 1: Expose Server to Internet (REQUIRED)

Twilio needs a **public URL** to send webhooks to. You have 2 options:

#### Option A: ngrok (Recommended for Testing)

1. Install ngrok: https://ngrok.com/download
2. Start the interactive server:
   ```bash
   node /workspace/group/interactive-call-server.js
   ```
3. In another terminal, expose it:
   ```bash
   ngrok http 3000
   ```
4. Copy the ngrok URL (e.g., `https://abc123.ngrok.io`)
5. Use that URL for webhooks

#### Option B: Deploy to Cloud (Production)

Deploy the server to:
- **Heroku** (free tier)
- **Railway** (simple deployment)
- **Your own VPS**
- **AWS Lambda** (with API Gateway)

### Step 2: Configure Twilio Webhooks

1. Go to Twilio Console → Phone Numbers
2. Click on your number: `+18104840553`
3. Under "Voice & Fax", set:
   - **A CALL COMES IN**: Webhook
   - **URL**: `https://your-ngrok-url.ngrok.io/voice/incoming`
   - **HTTP**: POST

### Step 3: Set Anthropic API Key

The server needs Claude API access:

```bash
export ANTHROPIC_API_KEY="your-anthropic-api-key"
```

Or edit `interactive-call-server.js` and add your key directly.

### Step 4: Test It!

1. Start the server:
   ```bash
   node interactive-call-server.js
   ```

2. Expose with ngrok:
   ```bash
   ngrok http 3000
   ```

3. Update Twilio webhook (see Step 2)

4. Make a test call:
   ```bash
   node make-interactive-call.js +919840882260 "This is a test of interactive calling"
   ```

## Example Conversations

### Restaurant Booking
```
Andy: Hello, this is Andy calling on behalf of Naveen Valsakumar.
      I'd like to book a table for 4 people tonight at 8 PM.

Restaurant: Let me check... What's the name for the reservation?

Andy: Naveen Valsakumar. That's N-A-V-E-E-N V-A-L-S-A-K-U-M-A-R.

Restaurant: Great! You're all set for 8 PM, table for 4.

Andy: Perfect, thank you so much! Have a great day. Goodbye!

[Call ends, Andy sends you transcript via WhatsApp]
```

### Product Inquiry
```
Andy: Hello, I'm calling to check if you have the Sony WH-1000XM5
      headphones in stock.

Store: Let me check... Yes, we have them in black and silver.

Andy: Great! What's the price?

Store: Rs. 29,990.

Andy: Perfect. Can you hold one in black? My name is Naveen.

Store: Sure, we'll hold it for 24 hours under Naveen.

Andy: Thank you! Goodbye!

[Transcript saved and sent to you]
```

## Current Limitations

### ⚠️ Webhook Server Needs to Run
- The server must be running and publicly accessible
- ngrok URLs change each time (free tier)
- For production, deploy to cloud

### ⚠️ Works Best For
- Simple scripted conversations
- Bookings and reservations
- Status checks
- Simple inquiries

### ⚠️ May Struggle With
- Complex negotiations
- Heavy accents
- Very noisy environments
- Emotional/sensitive topics

## File Structure

```
/workspace/group/
├── interactive-call-server.js    # Main webhook server
├── make-interactive-call.js      # Call initiator
├── twilio-config.json            # Your Twilio credentials
├── call-transcripts/             # Saved conversation logs
└── INTERACTIVE-CALLING-SETUP.md  # This file
```

## Cost Estimate

Same as regular calls:
- Phone number: ₹75/month
- Calls: ₹0.50-2/minute
- **No extra cost** for interactivity!

## Troubleshooting

### "Webhook returned invalid response"
- Server not running
- ngrok not exposing port 3000
- Wrong webhook URL in Twilio

### "No response from Andy"
- Anthropic API key missing/invalid
- Server crashed (check logs)
- Network issues

### "Poor speech recognition"
- Background noise
- Unclear speech
- Try speaking more clearly and slowly

## Next Steps

Once you've tested and it works:

1. **Deploy to cloud** for permanent URL
2. **Add conversation templates** for common tasks
3. **Improve AI prompts** for specific scenarios
4. **Add WhatsApp notifications** after each call

## Quick Test Commands

```bash
# Test 1: Start server
node interactive-call-server.js

# Test 2: (In another terminal) Expose server
ngrok http 3000

# Test 3: Update Twilio webhook URL to ngrok URL

# Test 4: Make test call
node make-interactive-call.js +919840882260 "Testing interactive calling"
```

## Ready to Try?

Let me know when you're ready to test, and I'll walk you through the setup step by step!
