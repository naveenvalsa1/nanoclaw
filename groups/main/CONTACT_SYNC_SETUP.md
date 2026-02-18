# Contact Sync Setup Instructions

This guide will help you set up automatic contact syncing from macOS Contacts app to Andy's workspace.

## Overview

The contact sync system works similarly to the calendar sync:
- Runs every 30 minutes on your Mac via launchd
- Exports contacts from macOS Contacts app
- Creates a JSON cache file that Andy can read
- Updates automatically in the background

## Setup Steps

### 1. Make the sync script executable

```bash
cd ~/claude-projects/whatsapp-agent/groups/main
chmod +x sync-contacts.sh
```

### 2. Update the launchd plist file

Edit `com.andy.synccontacts.plist` and replace `YOUR_USERNAME` with your actual macOS username:

```bash
# Find your username
whoami

# Edit the plist file
nano com.andy.synccontacts.plist
```

Replace both instances of `YOUR_USERNAME` with your actual username.

### 3. Test the sync script manually

```bash
./sync-contacts.sh
```

You should see output like:
```
Syncing contacts from macOS Contacts app...
✅ Synced 243 contacts at 2026-02-10T11:10:00.000Z
Output: /Users/YOUR_USERNAME/claude-projects/whatsapp-agent/groups/main/contacts-cache.json
```

### 4. Grant Contacts access

When you first run the script, macOS will prompt you to grant Terminal (or your terminal app) access to Contacts. Click "OK" to allow.

**Privacy Settings:** System Preferences → Security & Privacy → Privacy → Contacts → Enable your terminal app

### 5. Install the launchd service

```bash
# Copy the plist to LaunchAgents
cp com.andy.synccontacts.plist ~/Library/LaunchAgents/

# Load the service
launchctl load ~/Library/LaunchAgents/com.andy.synccontacts.plist

# Verify it's running
launchctl list | grep andy.synccontacts
```

### 6. Verify the sync is working

Check that the cache file was created:

```bash
cat contacts-cache.json | jq '.contactCount'
```

You should see the number of contacts synced.

## Output Format

The `contacts-cache.json` file contains:

```json
{
  "lastSync": "2026-02-10T11:10:00.000Z",
  "contactCount": 243,
  "contacts": [
    {
      "name": "John Doe",
      "company": "Acme Corp",
      "title": "CEO",
      "phones": [
        {"number": "+1234567890", "type": "mobile"},
        {"number": "+0987654321", "type": "work"}
      ],
      "emails": [
        {"address": "john@acme.com", "type": "work"}
      ],
      "notes": "Met at conference 2025"
    }
  ]
}
```

## Andy's Access

Once set up, Andy can:
- Read all your contacts
- Search by name, company, or phone number
- Look up contact details when making calls
- Reference contact info in conversations

## Troubleshooting

### Permission Denied
Make sure you've granted Contacts access in System Preferences → Security & Privacy → Privacy → Contacts

### Script Not Running
Check the logs:
```bash
tail -f ~/claude-projects/whatsapp-agent/groups/main/logs/contact-sync.log
tail -f ~/claude-projects/whatsapp-agent/groups/main/logs/contact-sync-error.log
```

### No Contacts Synced
Verify you have contacts in the Contacts app and that the script has permission to access them.

## Uninstall

To stop the sync:
```bash
launchctl unload ~/Library/LaunchAgents/com.andy.synccontacts.plist
rm ~/Library/LaunchAgents/com.andy.synccontacts.plist
```

## Privacy Note

Your contacts are stored locally in `/workspace/group/contacts-cache.json` and are only accessible to Andy in this container. They are not sent anywhere else.
