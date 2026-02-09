#!/usr/bin/env node

/**
 * Sync Apple Calendar (macOS Calendar.app) to JSON cache
 *
 * Uses icalBuddy to read events from ALL calendars on this Mac
 * and writes a unified JSON file that Andy can read from inside the container.
 *
 * Requires: brew install ical-buddy
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'apple-calendar-cache.json');
const DEFAULT_DAYS = 14;

const daysArg = process.argv.indexOf('--days');
const days = daysArg !== -1 ? parseInt(process.argv[daysArg + 1]) || DEFAULT_DAYS : DEFAULT_DAYS;

function run(cmd) {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 });
}

// ISO timestamp pattern: 2026-02-09T04:30:00+0530
const TS = '\\d{4}-\\d{2}-\\d{2}T[\\d:]+[+-]\\d{4}';
const dtRangeRe = new RegExp(`^(?:${TS}\\s+at\\s+)?(${TS})\\s*-\\s*(${TS})$`);
const dtSingleRe = new RegExp(`^(${TS})$`); // all-day events: single timestamp

try {
    // Use -sc to group events by calendar (calendar name appears as header)
    const raw = run(
        `icalBuddy -sc -nc -nrd -b '• ' ` +
        `-po 'title,datetime,location,notes' ` +
        `-iep 'title,datetime,location,notes' ` +
        `-df '%Y-%m-%dT%H:%M:%S%z' -tf '%Y-%m-%dT%H:%M:%S%z' ` +
        `eventsFrom:today to:today+${days}`
    );

    const events = [];
    let currentCalendar = '';
    let current = null;
    let lastProp = ''; // track which property we're continuing

    for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Calendar header: "CalendarName:" followed by "------------------------"
        if (!line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('•') && trimmed.endsWith(':') && !trimmed.startsWith('notes:') && !trimmed.startsWith('location:')) {
            if (current) events.push(current);
            current = null;
            currentCalendar = trimmed.slice(0, -1); // remove trailing ':'
            lastProp = '';
            continue;
        }

        // Separator line: "------------------------"
        if (/^-{3,}$/.test(trimmed)) continue;

        // New event: starts with "• "
        if (line.startsWith('• ')) {
            if (current) events.push(current);
            current = {
                summary: trimmed.replace(/^•\s*/, ''),
                calendar: currentCalendar,
                startDate: '',
                endDate: '',
                allDay: false,
                location: '',
                description: '',
            };
            lastProp = '';
            continue;
        }

        // Property lines (indented with spaces or tab)
        if (current && (line.startsWith('    ') || line.startsWith('\t'))) {
            // DateTime range: "2026-02-09T04:30:00+0530 at 2026-02-09T04:30:00+0530 - 2026-02-09T05:00:00+0530"
            // or just: "2026-02-09T04:00:00+0530 - 2026-02-09T04:30:00+0530"
            const dtMatch = trimmed.match(dtRangeRe);
            if (dtMatch) {
                current.startDate = dtMatch[1];
                current.endDate = dtMatch[2];
                lastProp = '';
                continue;
            }

            // Single timestamp (all-day events like birthdays)
            const dtSingle = trimmed.match(dtSingleRe);
            if (dtSingle) {
                current.startDate = dtSingle[1];
                current.allDay = true;
                lastProp = '';
                continue;
            }

            if (trimmed.startsWith('location:')) {
                current.location = trimmed.slice('location:'.length).trim();
                lastProp = 'location';
                continue;
            }

            if (trimmed.startsWith('notes:')) {
                current.description = trimmed.slice('notes:'.length).trim();
                lastProp = 'notes';
                continue;
            }

            // Continuation of multi-line property (notes or location)
            if (lastProp === 'notes') {
                current.description += '\n' + trimmed;
            } else if (lastProp === 'location') {
                current.location += '\n' + trimmed;
            }
        }
    }
    if (current) events.push(current);

    // Mark all-day events and fix events whose "title" is actually a timestamp
    for (const e of events) {
        if (!e.startDate) e.allDay = true;
        // If summary is a bare timestamp, it's a nameless event — use the timestamp as startDate
        const tsMatch = e.summary.match(dtSingleRe);
        if (tsMatch && !e.startDate) {
            e.startDate = tsMatch[1];
            e.summary = '(No title)';
            e.allDay = true;
        }
    }

    const calendars = [...new Set(events.map(e => e.calendar).filter(Boolean))];

    const cache = {
        lastSync: new Date().toISOString(),
        daysAhead: days,
        eventCount: events.length,
        calendars,
        events,
    };

    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
    console.log(`Synced ${events.length} events from ${calendars.length} calendars (next ${days} days)`);

} catch (err) {
    if (err.message && err.message.includes('command not found')) {
        console.error('icalBuddy not found. Install with: brew install ical-buddy');
    } else {
        console.error('Error syncing calendar:', err.message);
    }
    process.exit(1);
}
