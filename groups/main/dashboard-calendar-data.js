#!/usr/bin/env node

/**
 * Generate calendar data for dashboard
 * Reads apple-calendar-cache.json and outputs today's events in JSON format
 */

const fs = require('fs');
const path = require('path');

const CACHE_PATH = path.join(__dirname, 'apple-calendar-cache.json');

function getTodaysEvents() {
    try {
        const data = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));

        // Today in IST
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const todayEvents = data.events.filter(event => {
            const start = new Date(event.startDate);
            return start >= today && start < tomorrow;
        }).sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

        return {
            lastSync: data.lastSync,
            events: todayEvents.map(event => ({
                summary: event.summary,
                calendar: event.calendar,
                startDate: event.startDate,
                endDate: event.endDate,
                allDay: event.allDay,
                location: event.location,
                description: event.description
            }))
        };
    } catch (error) {
        console.error('Error reading calendar cache:', error.message);
        return {
            lastSync: null,
            events: [],
            error: error.message
        };
    }
}

// Output JSON
console.log(JSON.stringify(getTodaysEvents(), null, 2));
