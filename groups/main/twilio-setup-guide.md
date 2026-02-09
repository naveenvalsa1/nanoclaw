# Andy Voice Calling Setup Guide

## Overview
This guide will help you set up Twilio integration so Andy can make phone calls on your behalf.

## What You'll Be Able to Do

Once set up, you can ask Andy to:
- **Make restaurant bookings**: "Andy, call Peshawari and book a table for 4 at 8 PM tonight"
- **Check availability**: "Andy, call this number and ask if they have the product in stock"
- **Schedule appointments**: "Andy, call my dentist and schedule a checkup for next week"
- **Follow up calls**: "Andy, call the vendor and ask about delivery status"
- **Simple inquiries**: "Andy, call customer support and get my account balance"

## Step 1: Create Twilio Account

1. Go to **https://www.twilio.com/try-twilio**
2. Sign up with your email (naveenvalsa@gmail.com)
3. Verify your phone number
4. Complete the signup process

## Step 2: Get a Phone Number

1. Log into Twilio Console: https://console.twilio.com/
2. Go to **Phone Numbers** > **Manage** > **Buy a number**
3. Select **India (+91)** as country
4. Choose capabilities:
   - ✅ Voice
   - ✅ SMS (optional, but useful)
5. Search and buy a number (~₹75/month)

**Recommended:** Get an India number for best quality and cost for local calls.

## Step 3: Get API Credentials

1. In Twilio Console, go to **Account** > **API keys & tokens**
2. Find your **Account SID** (starts with AC...)
3. Find your **Auth Token** (click to reveal)
4. **IMPORTANT**: Copy these credentials - you'll give them to Andy

## Step 4: Configure Andy

Once you have the credentials, send them to Andy in this format:

```
Andy, here are my Twilio credentials:
Account SID: ACxxxxxxxxxxxxxxxxxxxxxx
Auth Token: xxxxxxxxxxxxxxxxxxxxxxxx
Phone Number: +91XXXXXXXXXX
```

Andy will:
1. Create a secure config file
2. Install Twilio SDK (npm package)
3. Set up voice calling scripts
4. Run a test call to your number
5. Confirm everything is working

## Step 5: Test It Out

Try a simple test call:
```
Andy, call my number (+91-XXXXXXXXXX) and say "Hello Naveen, this is Andy testing the voice calling feature"
```

## Pricing (Twilio India - February 2026)

### One-time costs:
- Setup: Free

### Monthly costs:
- Phone number rental: ~₹75/month

### Per-use costs:
- Outbound calls to India mobile: ~₹0.50-2.00/minute
- Outbound calls to India landline: ~₹0.30-1.00/minute
- SMS (optional): ~₹0.10/message
- Recording storage: Free for first 10GB

### Example monthly cost:
- 20 calls/month × 2 minutes average = 40 minutes
- 40 minutes × ₹1/min = ₹40
- **Total: ₹75 (number) + ₹40 (calls) = ₹115/month**

## Voice Options

Andy can use different AI voices:
- **English (India)**: Natural Indian English accent
- **English (US)**: American accent
- **Hindi**: For Hindi conversations
- **Male/Female**: Choose gender preference

## What Andy Can Handle

### ✅ Good for:
- Simple scripted conversations
- Asking specific questions and getting answers
- Making reservations/bookings
- Confirming appointments
- Getting status updates
- Leaving voicemail messages

### ⚠️ Limitations:
- Complex negotiations (better done by you)
- Emotional/sensitive conversations
- Heavy accent understanding (may need multiple attempts)
- Very noisy environments
- Multi-step complex problem solving

## Privacy & Recording

- All calls will be recorded for your review
- Transcripts will be saved
- You'll get a summary after each call
- Recordings auto-delete after 30 days (configurable)

## Sample Commands

Once set up, you can use commands like:

```
"Andy, call +91-44-XXXXXXXX and ask if they're open today"

"Andy, call Peshawari restaurant at +91-XXXXXXXXXX and make a reservation
for 4 people at 8 PM on Friday. If they ask, it's under my name Naveen."

"Andy, call this number +91-XXXXXXXXXX and check delivery status for
order #12345"

"Andy, call my assistant at +91-XXXXXXXXXX and remind them about
tomorrow's 10 AM meeting"
```

## Next Steps

**Ready to proceed?** Here's what you need to do:

1. ✅ Create Twilio account (15 minutes)
2. ✅ Buy a phone number (~₹75/month)
3. ✅ Get API credentials (Account SID & Auth Token)
4. ✅ Share credentials with Andy
5. ✅ Andy will set everything up and run a test

Let me know when you have the credentials, and I'll handle the rest!

---

**Questions?** Ask Andy:
- "How much will calling cost?"
- "Can you call international numbers?"
- "What if the person doesn't understand you?"
- "Can you call multiple people at once?"
