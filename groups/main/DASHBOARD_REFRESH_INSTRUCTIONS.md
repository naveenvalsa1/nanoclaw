# Dashboard Not Updating? Clear Your Browser Cache

## Quick Fix

The dashboard HTML file is cached by your browser. Here's how to force a refresh:

### Method 1: Hard Refresh (Fastest)
- **Chrome/Firefox/Edge (Windows/Linux)**: `Ctrl + Shift + R` or `Ctrl + F5`
- **Chrome/Firefox/Edge (Mac)**: `Cmd + Shift + R`
- **Safari (Mac)**: `Cmd + Option + R`

### Method 2: Clear Cache for This Page
1. Open Developer Tools (`F12` or `Cmd+Option+I` on Mac)
2. Right-click the refresh button in browser
3. Select "Empty Cache and Hard Reload"

### Method 3: Add Timestamp to URL
Instead of opening:
```
file:///path/to/andy-dashboard-no-login.html
```

Open:
```
file:///path/to/andy-dashboard-no-login.html?v=20260211
```

Change the number each time you want to force a reload.

## Verify It Worked

After refreshing, check for these indicators:

1. **Version Number**: Should show "v2.1 - Updated: Feb 11, 3:45 PM IST" in the sidebar
2. **Console Logs**: Open browser console (F12) and look for:
   - "Loading recurring tasks..."
   - "Recurring tasks loaded: 2 tasks"
   - "Loading calendar events..."
3. **Recurring Tasks Tab**: Should show 2 tasks:
   - Daily AI in Accounting & Finance News Digest
   - Weekly Competitor Intelligence Report for Zournal

## Still Not Working?

If you see the old version number or no console logs:

1. Check the file path - make sure you're opening the file from `/workspace/group/`
2. Try opening in a different browser
3. Try opening in private/incognito mode
4. Check browser console for errors (F12 → Console tab)

## Data Files Location

The dashboard loads these JSON files from the same directory:
- `tasks.json`
- `recurring-tasks.json`
- `apple-calendar-cache.json`

All files must be in the same folder as the HTML file.
