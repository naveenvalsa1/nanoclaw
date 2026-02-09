# Google Calendar Integration Setup Guide

## Overview

This guide will help you set up Google Calendar integration so Andy can read and create calendar events.

## What You'll Be Able to Do

Once set up, you can:
- "Andy, what's on my calendar today?"
- "Andy, schedule a meeting with John tomorrow at 3 PM"
- "Andy, am I free on Friday afternoon?"
- "Andy, send me my schedule for tomorrow"
- Get daily calendar summaries automatically

## Setup Options

### Option 1: OAuth 2.0 (Recommended - Most Secure)

This requires creating a Google Cloud project and OAuth credentials.

**Steps:**

1. **Create Google Cloud Project**
   - Go to: https://console.cloud.google.com/
   - Create new project: "Andy Assistant"
   - Enable Google Calendar API

2. **Create OAuth Credentials**
   - Go to: APIs & Services > Credentials
   - Click: Create Credentials > OAuth client ID
   - Application type: Desktop app
   - Name: "Andy Calendar Access"
   - Download JSON file

3. **Save Credentials**
   - Rename downloaded file to: `google-credentials.json`
   - Place in `/workspace/group/`

4. **First-Time Authorization**
   - Run: `node setup-google-calendar.js`
   - Opens browser for authorization
   - Grant calendar access
   - Token saved automatically

### Option 2: Service Account (For Automation)

Best for automated access without user interaction.

**Steps:**

1. **Create Service Account**
   - Go to: APIs & Services > Credentials
   - Create Credentials > Service Account
   - Download JSON key

2. **Share Calendar**
   - Open Google Calendar
   - Settings > Your calendar > Share with specific people
   - Add service account email (from JSON)
   - Give "Make changes to events" permission

3. **Save Credentials**
   - Save JSON as: `google-service-account.json`
   - Place in `/workspace/group/`

### Option 3: API Key (Read-Only, Public Calendars)

Simplest but only works for public calendars.

Not recommended for personal use.

## Quick Start (After Setup)

```javascript
// Get today's events
const events = await getCalendarEvents('today');

// Create an event
await createCalendarEvent({
  summary: 'Meeting with John',
  start: '2026-02-10T15:00:00',
  end: '2026-02-10T16:00:00'
});

// Check availability
const isFree = await checkAvailability('2026-02-10T15:00:00', '2026-02-10T16:00:00');
```

## Commands You Can Use

Once set up:

- **View events:**
  - "What's on my calendar today?"
  - "Show me tomorrow's schedule"
  - "Do I have any meetings this week?"

- **Create events:**
  - "Schedule lunch with Sarah tomorrow at 1 PM"
  - "Block 2 hours for deep work on Friday"
  - "Add a reminder to call John at 3 PM"

- **Check availability:**
  - "Am I free tomorrow at 2 PM?"
  - "When's my next available slot?"

## Troubleshooting

### "Invalid credentials"
- Check that credentials file exists
- Verify file is valid JSON
- Re-download from Google Cloud Console

### "Insufficient permissions"
- Ensure Calendar API is enabled
- Check OAuth scopes include calendar access
- Re-authorize if needed

### "Calendar not found"
- Verify calendar ID is correct
- Check service account has access (if using SA)
- Default calendar ID: "primary"

## Security Notes

- **Never share** your credentials files
- Credentials are stored locally only
- OAuth tokens can be revoked anytime
- Use service accounts for automation only

## Next Steps

1. Choose your setup option (OAuth recommended)
2. Follow steps to create credentials
3. Run setup script
4. Start using calendar commands!

---

Ready to set up? Let me know which option you prefer!
