#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('/workspace/group/calendar-config.json', 'utf8'));
const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

// Query a wider range - entire weekend + IST timezone consideration
const startDate = '20260208T183000'; // Feb 8, 11:30 PM IST = Feb 9, 5:00 AM UTC
const endDate = '20260210T183000';   // Feb 10, 11:30 PM IST

console.log('🔍 Debugging: Querying with wider time range...');
console.log(`Start: ${startDate} (covers all of Feb 9 IST)`);
console.log(`End: ${endDate}\n`);

const calendarPath = '/8228513241/calendars/03826077-0D34-4EB7-B741-427143F67CA7/';

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
    console.log(`Status: ${res.statusCode}\n`);

    if (res.statusCode === 207) {
      console.log('Full response (first 3000 chars):');
      console.log(responseData.substring(0, 3000));
      console.log('\n---\n');

      parseCalendarData(responseData);
    } else {
      console.error(`Failed: ${res.statusCode}`);
      console.log(responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(reportBody);
req.end();

function parseCalendarData(xml) {
  const calendarDataMatches = [...xml.matchAll(/<C:calendar-data>([\s\S]*?)<\/C:calendar-data>/g)];

  console.log(`Found ${calendarDataMatches.length} calendar-data blocks\n`);

  if (calendarDataMatches.length === 0) {
    console.log('❌ No events found in this calendar');
    console.log('\nPossible reasons:');
    console.log('1. Events might be in a different calendar');
    console.log('2. Timezone mismatch');
    console.log('3. Calendar not synced properly');
    return;
  }

  calendarDataMatches.forEach((match, idx) => {
    const icalData = match[1]
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');

    console.log(`\nEvent ${idx + 1}:`);
    console.log('---');

    const summary = icalData.match(/SUMMARY:(.*)/)?.[1]?.trim();
    const dtstart = icalData.match(/DTSTART[^:]*:(.*)/)?.[1]?.trim();
    const dtend = icalData.match(/DTEND[^:]*:(.*)/)?.[1]?.trim();
    const location = icalData.match(/LOCATION:(.*)/)?.[1]?.trim();

    if (summary) console.log(`Title: ${summary}`);
    if (dtstart) console.log(`Start: ${dtstart}`);
    if (dtend) console.log(`End: ${dtend}`);
    if (location) console.log(`Location: ${location}`);
  });
}
