#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Read calendar config
const config = JSON.parse(fs.readFileSync('/workspace/group/calendar-config.json', 'utf8'));

// Create basic auth header
const auth = Buffer.from(`${config.username}:${config.password}`).toString('base64');

// First, discover the principal URL
const propfindBody = `<?xml version="1.0" encoding="utf-8" ?>
<D:propfind xmlns:D="DAV:">
  <D:prop>
    <D:current-user-principal />
  </D:prop>
</D:propfind>`;

const options = {
  hostname: 'caldav.icloud.com',
  port: 443,
  path: '/',
  method: 'PROPFIND',
  headers: {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/xml; charset=utf-8',
    'Content-Length': Buffer.byteLength(propfindBody),
    'Depth': '0'
  }
};

console.log('🔍 Discovering iCloud CalDAV principal...');

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    console.log(`Status: ${res.statusCode}`);

    if (res.statusCode === 207 || res.statusCode === 200) {
      console.log('✅ CalDAV connection successful!');
      console.log('\nRaw Response:');
      console.log(responseData);

      // Try to extract principal URL
      const principalMatch = responseData.match(/<D:href>([^<]+)<\/D:href>/);
      if (principalMatch) {
        console.log('\n📍 Principal URL found:', principalMatch[1]);
      }
    } else if (res.statusCode === 401) {
      console.error('❌ Authentication failed.');
      console.error('Please verify:');
      console.error('1. Your Apple ID email is correct');
      console.error('2. Your app-specific password is correct');
      console.error('3. Two-factor authentication is enabled on your Apple ID');
    } else {
      console.error(`❌ Unexpected response: ${res.statusCode}`);
      console.log('Response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Connection error:', error.message);
});

req.write(propfindBody);
req.end();
