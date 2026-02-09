#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('/workspace/group/calendar-config.json', 'utf8'));
const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

// Date range for tomorrow (Feb 9, 2026)
const startDate = '20260209T000000';
const endDate = '20260210T000000';

console.log('📅 Fetching events for Sunday, February 9, 2026...\n');

// Query the Home calendar directly
const calendarPath = '/8228513241/calendars/03826077-0D34-4EB7-B741-427143F67CA7/';

const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:getetag/>
    <C:calendar-data/>
  </D:prop>
  <C:filter>
    <C:comp-filter name="VCALENDAR">
      <C:comp-filter name="VEVENT">
        <C:time-range start="${startDate}Z" end="${endDate}Z"/>
      </C:comp-filter>
    </C:comp-filter>
  </C:filter>
</C:calendar-query>`;

const options = {
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

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 207) {
      parseCalendarData(responseData);
    } else {
      console.error(`❌ Failed: ${res.statusCode}`);
      console.log(responseData.substring(0, 500));
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error:', error.message);
});

req.write(reportBody);
req.end();

function parseCalendarData(xml) {
  const calendarDataMatches = xml.matchAll(/<C:calendar-data>([\s\S]*?)<\/C:calendar-data>/g);

  let eventCount = 0;
  const events = [];

  for (const match of calendarDataMatches) {
    const icalData = match[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\\n/g, '\n');

    const summary = icalData.match(/SUMMARY:(.*)/)?.[1]?.trim() || 'Untitled';
    const dtstart = icalData.match(/DTSTART[^:]*:(.*)/)?.[1]?.trim();
    const dtend = icalData.match(/DTEND[^:]*:(.*)/)?.[1]?.trim();
    const location = icalData.match(/LOCATION:(.*)/)?.[1]?.trim() || '';
    const description = icalData.match(/DESCRIPTION:(.*)/)?.[1]?.trim() || '';

    if (dtstart) {
      events.push({
        summary,
        dtstart,
        dtend,
        location,
        description
      });
    }
  }

  // Sort events by start time
  events.sort((a, b) => a.dtstart.localeCompare(b.dtstart));

  if (events.length === 0) {
    console.log('✨ No events scheduled for tomorrow (Sunday, February 9)');
    console.log('You have a free day!');
  } else {
    console.log(`Found ${events.length} event(s):\n`);

    events.forEach((event, idx) => {
      console.log(`${idx + 1}. ${event.summary}`);
      console.log(`   Time: ${formatDateTime(event.dtstart)}${event.dtend ? ' - ' + formatTime(event.dtend) : ''}`);
      if (event.location) {
        console.log(`   Location: ${event.location}`);
      }
      if (event.description) {
        console.log(`   Notes: ${event.description}`);
      }
      console.log('');
    });
  }
}

function formatDateTime(dtString) {
  if (!dtString) return '';

  if (dtString.includes('T')) {
    const year = dtString.substr(0, 4);
    const month = dtString.substr(4, 2);
    const day = dtString.substr(6, 2);
    const hour = dtString.substr(9, 2);
    const min = dtString.substr(11, 2);

    // Convert to 12-hour format
    let h = parseInt(hour);
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;

    return `${h}:${min} ${ampm}`;
  } else {
    return 'All day';
  }
}

function formatTime(dtString) {
  return formatDateTime(dtString);
}
