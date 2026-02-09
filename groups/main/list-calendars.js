#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

const config = JSON.parse(fs.readFileSync('/workspace/group/calendar-config.json', 'utf8'));
const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

console.log('Discovering calendars...\n');

// Try the most common iCloud calendar path
const calendarPath = `/8228513241/calendars/`;

const options = {
  hostname: 'caldav.icloud.com',
  port: 443,
  path: calendarPath,
  method: 'PROPFIND',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/xml; charset=utf-8',
    'Depth': '1'
  }
};

const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav" xmlns:A="http://apple.com/ns/ical/">
  <D:prop>
    <D:displayname/>
    <D:resourcetype/>
    <A:calendar-color/>
    <C:calendar-description/>
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
      console.log('✅ Calendars found!\n');

      // Parse response to extract calendar names and paths
      const responses = responseData.split('<D:response>');

      responses.forEach((resp, idx) => {
        if (idx === 0) return; // Skip first empty split

        const hrefMatch = resp.match(/<D:href>([^<]+)<\/D:href>/);
        const nameMatch = resp.match(/<D:displayname>([^<]+)<\/D:displayname>/);
        const isCalendar = resp.includes('<C:calendar');

        if (hrefMatch && nameMatch && isCalendar) {
          console.log(`Calendar: ${nameMatch[1]}`);
          console.log(`Path: ${hrefMatch[1]}`);
          console.log('');
        }
      });

      console.log('\nRaw XML (first 2000 chars):');
      console.log(responseData.substring(0, 2000));
    } else {
      console.error(`Failed: ${res.statusCode}`);
      console.log(responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('Error:', error.message);
});

req.write(propfindBody);
req.end();
