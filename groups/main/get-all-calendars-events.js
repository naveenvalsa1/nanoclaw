#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('/workspace/group/calendar-config.json', 'utf8'));
const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

const startDate = '20260209T000000';
const endDate = '20260210T000000';

console.log('📅 Checking ALL calendars for Sunday, February 9, 2026...\n');

// First, discover all calendars
const calendarPath = `/8228513241/calendars/`;

const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
  </D:prop>
</D:propfind>`;

const options = {
  hostname: 'caldav.icloud.com',
  port: 443,
  path: calendarPath,
  method: 'PROPFIND',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(propfindBody),
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
      const responses = responseData.split('<D:response>');
      const calendars = [];

      responses.forEach((resp, idx) => {
        if (idx === 0) return;

        const hrefMatch = resp.match(/<D:href>([^<]+)<\/D:href>/);
        const nameMatch = resp.match(/<D:displayname>([^<]+)<\/D:displayname>/);
        const isCalendar = resp.includes('<C:calendar');

        if (hrefMatch && nameMatch && isCalendar && hrefMatch[1].endsWith('/')) {
          calendars.push({
            name: nameMatch[1],
            path: hrefMatch[1]
          });
        }
      });

      console.log(`Found ${calendars.length} calendar(s):\n`);
      calendars.forEach(cal => console.log(`  - ${cal.name}`));
      console.log('');

      // Query each calendar for events
      let processed = 0;
      calendars.forEach(calendar => {
        queryCalendar(calendar, () => {
          processed++;
          if (processed === calendars.length) {
            console.log('\n✅ Finished checking all calendars');
          }
        });
      });
    } else {
      console.error(`Failed: ${res.statusCode}`);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(propfindBody);
req.end();

function queryCalendar(calendar, callback) {
  const reportBody = `<?xml version="1.0" encoding="utf-8" ?>
<C:calendar-query xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
  <D:prop>
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

  const options2 = {
    hostname: 'caldav.icloud.com',
    port: 443,
    path: calendar.path,
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
        parseCalendarData(responseData, calendar.name);
      }
      callback();
    });
  });

  req2.on('error', (error) => {
    console.error(`Error querying ${calendar.name}:`, error.message);
    callback();
  });

  req2.write(reportBody);
  req2.end();
}

function parseCalendarData(xml, calendarName) {
  const calendarDataMatches = xml.matchAll(/<C:calendar-data>([\s\S]*?)<\/C:calendar-data>/g);

  const events = [];

  for (const match of calendarDataMatches) {
    const icalData = match[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    const summary = icalData.match(/SUMMARY:(.*)/)?.[1]?.trim() || 'Untitled';
    const dtstart = icalData.match(/DTSTART[^:]*:(.*)/)?.[1]?.trim();
    const dtend = icalData.match(/DTEND[^:]*:(.*)/)?.[1]?.trim();
    const location = icalData.match(/LOCATION:(.*)/)?.[1]?.trim() || '';

    if (dtstart) {
      events.push({ summary, dtstart, dtend, location });
    }
  }

  if (events.length > 0) {
    console.log(`\n📅 ${calendarName}:`);
    events.sort((a, b) => a.dtstart.localeCompare(b.dtstart));

    events.forEach(event => {
      console.log(`  • ${event.summary}`);
      console.log(`    ${formatDateTime(event.dtstart)}${event.dtend ? ' - ' + formatTime(event.dtend) : ''}`);
      if (event.location) {
        console.log(`    📍 ${event.location}`);
      }
    });
  }
}

function formatDateTime(dtString) {
  if (!dtString) return '';

  if (dtString.includes('T')) {
    const hour = dtString.substr(9, 2);
    const min = dtString.substr(11, 2);
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
