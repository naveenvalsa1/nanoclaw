#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Read calendar config
const config = JSON.parse(fs.readFileSync('/workspace/group/calendar-config.json', 'utf8'));

// Get command line arguments for date range
const startDate = process.argv[2]; // ISO format: 2026-02-09T00:00:00
const endDate = process.argv[3];   // ISO format: 2026-02-10T00:00:00

if (!startDate || !endDate) {
  console.error('Usage: get-calendar-events.js <start-date> <end-date>');
  console.error('Example: get-calendar-events.js 2026-02-09T00:00:00 2026-02-10T00:00:00');
  process.exit(1);
}

// Create basic auth header
const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

// CalDAV REPORT query to get events in date range
const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${startDate.replace(/[-:]/g, '')}Z" end="${endDate.replace(/[-:]/g, '')}Z"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

// First get the calendar home set
const principalPath = '/8228513241/principal/';

const options = {
  hostname: 'caldav.icloud.com',
  port: 443,
  path: principalPath,
  method: 'PROPFIND',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/xml; charset=utf-8',
    'Depth': '0'
  }
};

console.log(`Fetching events from ${startDate} to ${endDate}...`);

// Get calendar-home-set first
const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <C:calendar-home-set/>
  </D:prop>
</D:propfind>`;

options.headers['Content-Length'] = Buffer.byteLength(propfindBody);

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 207) {
      // Extract calendar-home-set
      const match = responseData.match(/<C:calendar-home-set[^>]*>[\s\S]*?<D:href>([^<]+)<\/D:href>/);
      if (match) {
        const calendarPath = match[1];
        console.log(`Calendar home: ${calendarPath}`);

        // Now query for events
        queryEvents(calendarPath);
      } else {
        console.error('Could not find calendar-home-set');
      }
    } else {
      console.error(`Failed to get calendar home: ${res.statusCode}`);
      console.log(responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(propfindBody);
req.end();

function queryEvents(calendarPath) {
  const options2 = {
    hostname: 'caldav.icloud.com',
    port: 443,
    path: calendarPath,
    method: 'REPORT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(reportBody),
      'Depth': '1'
    }
  };

  const req2 = https.request(options2, (res) => {
    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk;
    });

    res.on('end', () => {
      if (res.statusCode === 207) {
        console.log('\n✅ Events retrieved successfully!\n');
        parseCalendarData(responseData);
      } else {
        console.error(`Failed to get events: ${res.statusCode}`);
        console.log(responseData);
      }
    });
  });

  req2.on('error', (error) => {
    console.error('Error:', error.message);
  });

  req2.write(reportBody);
  req2.end();
}

function parseCalendarData(xml) {
  // Extract all calendar-data blocks
  const calendarDataMatches = xml.matchAll(/<C:calendar-data>([\s\S]*?)<\/C:calendar-data>/g);

  let eventCount = 0;
  for (const match of calendarDataMatches) {
    const icalData = match[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

    // Parse iCal format
    const summary = icalData.match(/SUMMARY:(.*)/)?.[1] || 'Untitled';
    const dtstart = icalData.match(/DTSTART[^:]*:(.*)/)?.[1];
    const dtend = icalData.match(/DTEND[^:]*:(.*)/)?.[1];
    const location = icalData.match(/LOCATION:(.*)/)?.[1] || '';
    const description = icalData.match(/DESCRIPTION:(.*)/)?.[1] || '';

    if (dtstart) {
      eventCount++;
      console.log(`Event ${eventCount}:`);
      console.log(`  Title: ${summary}`);
      console.log(`  Start: ${formatDateTime(dtstart)}`);
      if (dtend) {
        console.log(`  End: ${formatDateTime(dtend)}`);
      }
      if (location) {
        console.log(`  Location: ${location}`);
      }
      if (description) {
        console.log(`  Description: ${description}`);
      }
      console.log('');
    }
  }

  if (eventCount === 0) {
    console.log('No events found for this date range.');
  } else {
    console.log(`Total events: ${eventCount}`);
  }
}

function formatDateTime(dtString) {
  // Parse iCal datetime format (YYYYMMDDTHHMMSS or YYYYMMDD)
  if (dtString.includes('T')) {
    const year = dtString.substr(0, 4);
    const month = dtString.substr(4, 2);
    const day = dtString.substr(6, 2);
    const hour = dtString.substr(9, 2);
    const min = dtString.substr(11, 2);
    return `${year}-${month}-${day} ${hour}:${min}`;
  } else {
    const year = dtString.substr(0, 4);
    const month = dtString.substr(4, 2);
    const day = dtString.substr(6, 2);
    return `${year}-${month}-${day} (All day)`;
  }
}
