#!/usr/bin/env node

/**
 * Simple Calendar Access - No OAuth Required!
 * Uses Google App Password + CalDAV
 */

const axios = require('axios');
const ical = require('node-ical');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'calendar-config.json');

/**
 * Get calendar events using public iCal feed
 */
async function getCalendarEventsSimple(daysAhead = 7) {
    try {
        // For now, return empty - user needs to provide their calendar feed URL
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

        if (!config.ical_url) {
            throw new Error('No calendar feed URL configured');
        }

        const response = await axios.get(config.ical_url);
        const events = await ical.async.parseICS(response.data);

        const now = new Date();
        const futureDate = new Date();
        futureDate.setDate(futureDate.getDate() + daysAhead);

        const upcomingEvents = [];

        for (let k in events) {
            const event = events[k];
            if (event.type === 'VEVENT') {
                const start = new Date(event.start);
                if (start >= now && start <= futureDate) {
                    upcomingEvents.push({
                        summary: event.summary,
                        start: event.start,
                        end: event.end,
                        description: event.description || '',
                        location: event.location || ''
                    });
                }
            }
        }

        // Sort by start time
        upcomingEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

        return upcomingEvents;

    } catch (error) {
        console.error('Error fetching calendar:', error.message);
        throw error;
    }
}

/**
 * Get today's events
 */
async function getTodaysEvents() {
    const allEvents = await getCalendarEventsSimple(1);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return allEvents.filter(event => {
        const eventDate = new Date(event.start);
        return eventDate >= today && eventDate < tomorrow;
    });
}

/**
 * Format events for display
 */
function formatEvents(events) {
    if (events.length === 0) {
        return 'No events scheduled';
    }

    return events.map(event => {
        const start = new Date(event.start);
        const timeStr = start.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
        });

        return `${timeStr} - ${event.summary}${event.location ? ` (${event.location})` : ''}`;
    }).join('\n');
}

// CLI usage
if (require.main === module) {
    const command = process.argv[2] || 'today';

    (async () => {
        try {
            if (command === 'today') {
                const events = await getTodaysEvents();
                console.log('\n📅 Today\'s Events:\n');
                console.log(formatEvents(events));
            } else if (command === 'week') {
                const events = await getCalendarEventsSimple(7);
                console.log('\n📅 This Week\'s Events:\n');
                console.log(formatEvents(events));
            }
        } catch (error) {
            console.error('\n❌ Error:', error.message);
            console.log('\n💡 Setup needed:');
            console.log('1. Get your Google Calendar iCal URL:');
            console.log('   - Open Google Calendar');
            console.log('   - Settings > Your calendar > Integrate calendar');
            console.log('   - Copy "Secret address in iCal format"');
            console.log('2. Add to calendar-config.json:');
            console.log('   {"ical_url": "YOUR_ICAL_URL"}');
        }
    })();
}

module.exports = {
    getCalendarEventsSimple,
    getTodaysEvents,
    formatEvents
};
