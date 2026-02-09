# Quick Setup Guide - Interactive Calling with ngrok

## What You Need (5 minutes total)

Follow these steps to enable full AI conversations during calls.

---

## Step 1: Download ngrok (1 minute)

**Mac:**
```bash
brew install ngrok
```

**Windows:**
Download from: https://ngrok.com/download
Or use: `choco install ngrok`

**Linux:**
```bash
curl -s https://ngrok-agent.s3.amazonaws.com/ngrok.asc | sudo tee /etc/apt/trusted.gpg.d/ngrok.asc >/dev/null
echo "deb https://ngrok-agent.s3.amazonaws.com buster main" | sudo tee /etc/apt/sources.list.d/ngrok.list
sudo apt update && sudo apt install ngrok
```

---

## Step 2: Get Files to Your Computer (1 minute)

The server files are in `/workspace/group/`. You need to copy:
- `interactive-call-server.js`
- `twilio-config.json`
- `package.json`
- `node_modules/` (or just run `npm install`)

**Copy files:**
```bash
# On your computer, create a folder
mkdir ~/andy-calling
cd ~/andy-calling

# Copy the files from the container
# (You'll need to use your file browser or scp/docker cp)
```

---

## Step 3: Start the Server (30 seconds)

```bash
cd ~/andy-calling
node interactive-call-server.js
```

You should see:
```
🚀 Interactive calling server running on port 3000
📞 Webhook URL: http://your-public-url:3000/voice/incoming
```

---

## Step 4: Expose with ngrok (30 seconds)

**Open a NEW terminal** (keep server running) and run:

```bash
ngrok http 3000
```

You'll see something like:
```
Forwarding   https://abc123.ngrok.io -> http://localhost:3000
```

**Copy that HTTPS URL** (e.g., `https://abc123.ngrok.io`)

---

## Step 5: Configure Twilio (2 minutes)

1. Go to: **https://console.twilio.com/us1/develop/phone-numbers/manage/incoming**

2. Click on your number: **+1 (810) 484-0553**

3. Scroll to **"Voice & Fax"** section

4. Under **"A CALL COMES IN"**:
   - Select: **Webhook**
   - Enter: `https://YOUR-NGROK-URL.ngrok.io/voice/incoming`
   - Method: **HTTP POST**

5. Click **Save**

---

## Step 6: Set Anthropic API Key (30 seconds)

The server needs your Claude API key for AI responses.

**Mac/Linux:**
```bash
export ANTHROPIC_API_KEY="your-key-here"
node interactive-call-server.js
```

**Or edit the file:**
Open `interactive-call-server.js` and find line ~20:
```javascript
const anthropic = new Anthropic({
    apiKey: 'PUT-YOUR-KEY-HERE'
});
```

---

## Step 7: Test It! 🎉

Ask Andy to make an interactive call:

```
Andy, call +919840882260 and ask what time I should arrive for dinner
```

**What happens:**
1. Andy calls you
2. Andy: "Hello, this is Andy calling on behalf of Naveen. What time should he arrive for dinner?"
3. You: "7 PM would be perfect"
4. Andy: "Great! 7 PM it is. Thank you!"
5. Andy sends you transcript via WhatsApp

---

## Troubleshooting

### "Webhook returned invalid response"
- Server not running → Check terminal
- Wrong URL → Update Twilio webhook

### "No AI response"
- API key missing → Set ANTHROPIC_API_KEY
- Check server logs for errors

### ngrok URL changed
- Free ngrok URLs change on restart
- Re-update Twilio webhook with new URL
- Or sign up for ngrok (free) to get static URL

---

## Alternative: Quick Test WITHOUT Full Setup

If you just want to test before full setup:

```bash
node test-interactive-local.js +919840882260
```

This does a simple interactive test without needing ngrok.

---

## Need Help?

Just ask Andy! Say:
- "Andy, help me setup interactive calling"
- "Andy, test my interactive calling"
- "Andy, what's my ngrok URL?"

---

Ready to go? Start with **Step 2** (get files to your computer)!
