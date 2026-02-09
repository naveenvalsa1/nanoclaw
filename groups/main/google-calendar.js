#!/usr/bin/env node

/**
 * Google Calendar Integration for Andy
 *
 * Provides calendar access functionality (read, create, update, delete)
 * Calendar: naveen@notionpress.com (Google Workspace)
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

// Paths
const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'google-calendar-token.json');

// OAuth scopes
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

/**
 * Get authorized Google Calendar client
 */
async function getCalendarClient() {
    // Try OAuth first
    if (fs.existsSync(CREDENTIALS_PATH)) {
        return await getOAuthClient();
    }

    // Try Service Account
    const saPath = path.join(__dirname, 'google-service-account.json');
    if (fs.existsSync(saPath)) {
        return await getServiceAccountClient();
    }

    throw new Error('No Google Calendar credentials found. Run setup first.');
}

/**
 * Get OAuth client
 */
async function getOAuthClient() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Auto-save refreshed tokens
    oAuth2Client.on('tokens', (tokens) => {
        try {
            const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            const merged = { ...existing, ...tokens };
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged));
        } catch {}
    });

    // Check if we have a token
    if (fs.existsSync(TOKEN_PATH)) {
        const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
        oAuth2Client.setCredentials(token);
        return oAuth2Client;
    }

    throw new Error('No token found. Run: node setup-google-calendar.js');
}

/**
 * Get Service Account client
 */
async function getServiceAccountClient() {
    const saPath = path.join(__dirname, 'google-service-account.json');
    const auth = new google.auth.GoogleAuth({
        keyFile: saPath,
        scopes: SCOPES,
    });

    return await auth.getClient();
}

/**
 * Get upcoming events
 */
async function getUpcomingEvents(timeMin = new Date(), maxResults = 10) {
    const auth = await getCalendarClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: timeMin.toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
    });

    return response.data.items || [];
}

/**
 * Get events for a specific date
 */
async function getEventsForDate(date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const auth = await getCalendarClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: startOfDay.toISOString(),
        timeMax: endOfDay.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    });

    return response.data.items || [];
}

/**
 * Get events for a date range
 */
async function getEventsForRange(startDate, endDate) {
    const auth = await getCalendarClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date(startDate).toISOString(),
        timeMax: new Date(endDate).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
    });

    return response.data.items || [];
}

/**
 * Create a calendar event
 */
async function createEvent(eventDetails) {
    const auth = await getCalendarClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const event = {
        summary: eventDetails.summary,
        description: eventDetails.description || '',
        start: {
            dateTime: eventDetails.start,
            timeZone: 'Asia/Kolkata',
        },
        end: {
            dateTime: eventDetails.end,
            timeZone: 'Asia/Kolkata',
        },
        attendees: eventDetails.attendees || [],
        reminders: {
            useDefault: true,
        },
    };

    if (eventDetails.location) {
        event.location = eventDetails.location;
    }

    const response = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
    });

    return response.data;
}

/**
 * Update a calendar event
 */
async function updateEvent(eventId, updates) {
    const auth = await getCalendarClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const resource = {};
    if (updates.summary) resource.summary = updates.summary;
    if (updates.description) resource.description = updates.description;
    if (updates.location) resource.location = updates.location;
    if (updates.start) resource.start = { dateTime: updates.start, timeZone: 'Asia/Kolkata' };
    if (updates.end) resource.end = { dateTime: updates.end, timeZone: 'Asia/Kolkata' };

    const response = await calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        resource: resource,
    });

    return response.data;
}

/**
 * Delete a calendar event
 */
async function deleteEvent(eventId) {
    const auth = await getCalendarClient();
    const calendar = google.calendar({ version: 'v3', auth });

    await calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
    });

    return { success: true, eventId };
}

/**
 * Check availability
 */
async function checkAvailability(startTime, endTime) {
    const auth = await getCalendarClient();
    const calendar = google.calendar({ version: 'v3', auth });

    const response = await calendar.freebusy.query({
        resource: {
            timeMin: new Date(startTime).toISOString(),
            timeMax: new Date(endTime).toISOString(),
            items: [{ id: 'primary' }],
        },
    });

    const busy = response.data.calendars.primary.busy || [];
    return { free: busy.length === 0, busySlots: busy };
}

/**
 * Format event for display
 */
function formatEvent(event) {
    const start = event.start.dateTime || event.start.date;
    const end = event.end.dateTime || event.end.date;

    const startDate = new Date(start);
    const endDate = new Date(end);

    const timeStr = event.start.dateTime
        ? `${startDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
        : 'All day';

    return {
        id: event.id,
        summary: event.summary || '(No title)',
        time: timeStr,
        date: startDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' }),
        description: event.description || '',
        location: event.location || '',
        link: event.htmlLink
    };
}

// Export functions
module.exports = {
    getUpcomingEvents,
    getEventsForDate,
    getEventsForRange,
    createEvent,
    updateEvent,
    deleteEvent,
    checkAvailability,
    formatEvent
};

/**
 * Parse --key value args from argv
 */
function parseArgs(args) {
    const parsed = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            parsed[key] = args[i + 1] || '';
            i++;
        }
    }
    return parsed;
}

/**
 * Print events (text or JSON)
 */
function printEvents(events, label, jsonMode) {
    if (jsonMode) {
        console.log(JSON.stringify(events.map(e => ({ ...formatEvent(e), rawStart: e.start, rawEnd: e.end })), null, 2));
        return;
    }
    console.log(`\n${label}\n`);
    if (events.length === 0) {
        console.log('No events scheduled');
    } else {
        events.forEach(event => {
            const f = formatEvent(event);
            console.log(`  ${f.time} - ${f.summary}${f.location ? ' @ ' + f.location : ''}`);
            if (f.id) console.log(`    ID: ${f.id}`);
        });
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];
    const jsonMode = args.includes('--json');
    const filteredArgs = args.filter(a => a !== '--json');

    if (!command) {
        console.log('Usage: node google-calendar.js <command> [options]');
        console.log('\nRead commands:');
        console.log('  today                  Show today\'s events');
        console.log('  tomorrow               Show tomorrow\'s events');
        console.log('  upcoming [N]           Show next N events (default 10)');
        console.log('  date <YYYY-MM-DD>      Show events for a date');
        console.log('  week                   Show events for the next 7 days');
        console.log('  range <start> <end>    Show events in a date range');
        console.log('  free <start> <end>     Check availability');
        console.log('\nWrite commands:');
        console.log('  create --summary "..." --start "..." --end "..." [--description "..."] [--location "..."]');
        console.log('  update <eventId> --summary "..." [--start "..."] [--end "..."]');
        console.log('  delete <eventId>');
        console.log('\nOptions:');
        console.log('  --json                 Output as JSON (for read commands)');
        process.exit(1);
    }

    (async () => {
        try {
            switch (command) {
                case 'today': {
                    const events = await getEventsForDate(new Date());
                    printEvents(events, 'Today\'s Events:', jsonMode);
                    break;
                }
                case 'tomorrow': {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const events = await getEventsForDate(tomorrow);
                    printEvents(events, 'Tomorrow\'s Events:', jsonMode);
                    break;
                }
                case 'upcoming': {
                    const count = parseInt(filteredArgs[1]) || 10;
                    const events = await getUpcomingEvents(new Date(), count);
                    printEvents(events, `Upcoming Events (next ${count}):`, jsonMode);
                    break;
                }
                case 'date': {
                    const dateStr = filteredArgs[1];
                    if (!dateStr) { console.error('Usage: date <YYYY-MM-DD>'); process.exit(1); }
                    const events = await getEventsForDate(new Date(dateStr));
                    printEvents(events, `Events for ${dateStr}:`, jsonMode);
                    break;
                }
                case 'week': {
                    const start = new Date();
                    const end = new Date();
                    end.setDate(end.getDate() + 7);
                    const events = await getEventsForRange(start, end);
                    printEvents(events, 'Events this week:', jsonMode);
                    break;
                }
                case 'range': {
                    const rangeStart = filteredArgs[1];
                    const rangeEnd = filteredArgs[2];
                    if (!rangeStart || !rangeEnd) { console.error('Usage: range <start-date> <end-date>'); process.exit(1); }
                    const events = await getEventsForRange(rangeStart, rangeEnd);
                    printEvents(events, `Events ${rangeStart} to ${rangeEnd}:`, jsonMode);
                    break;
                }
                case 'free': {
                    const freeStart = filteredArgs[1];
                    const freeEnd = filteredArgs[2];
                    if (!freeStart || !freeEnd) { console.error('Usage: free <start-datetime> <end-datetime>'); process.exit(1); }
                    const result = await checkAvailability(freeStart, freeEnd);
                    if (jsonMode) {
                        console.log(JSON.stringify(result, null, 2));
                    } else {
                        console.log(result.free ? '\nYou are FREE during that time.' : '\nYou are BUSY during that time.');
                        if (result.busySlots.length > 0) {
                            console.log('Busy slots:');
                            result.busySlots.forEach(s => console.log(`  ${new Date(s.start).toLocaleString('en-IN')} - ${new Date(s.end).toLocaleString('en-IN')}`));
                        }
                    }
                    break;
                }
                case 'create': {
                    const createArgs = parseArgs(filteredArgs.slice(1));
                    if (!createArgs.summary || !createArgs.start || !createArgs.end) {
                        console.error('Usage: create --summary "..." --start "..." --end "..."');
                        process.exit(1);
                    }
                    const created = await createEvent(createArgs);
                    console.log(JSON.stringify({ success: true, eventId: created.id, link: created.htmlLink, summary: created.summary }, null, 2));
                    break;
                }
                case 'update': {
                    const eventId = filteredArgs[1];
                    if (!eventId) { console.error('Usage: update <eventId> --summary "..."'); process.exit(1); }
                    const updateArgs = parseArgs(filteredArgs.slice(2));
                    const updated = await updateEvent(eventId, updateArgs);
                    console.log(JSON.stringify({ success: true, eventId: updated.id, summary: updated.summary }, null, 2));
                    break;
                }
                case 'delete': {
                    const delId = filteredArgs[1];
                    if (!delId) { console.error('Usage: delete <eventId>'); process.exit(1); }
                    const result = await deleteEvent(delId);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                default:
                    console.error(`Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (error) {
            console.error('Error:', error.message);
            process.exit(1);
        }
    })();
}
