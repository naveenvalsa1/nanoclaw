#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Read email config
const config = JSON.parse(fs.readFileSync('/workspace/group/email-config.json', 'utf8'));

// Read arguments
const args = process.argv.slice(2);
const subject = args[0] || 'Daily AI in Accounting & Finance Summary';
const htmlFile = args[1]; // Path to HTML file

let htmlContent = '<h1>Test Email</h1><p>This is a test email from Andy Assistant.</p>';

// If HTML file is provided, read it
if (htmlFile && fs.existsSync(htmlFile)) {
  htmlContent = fs.readFileSync(htmlFile, 'utf8');
}

const data = JSON.stringify({
  from: `${config.sender_name} <${config.sender_email}>`,
  to: [config.recipient_email],
  subject: subject,
  html: htmlContent
});

const options = {
  hostname: 'api.resend.com',
  port: 443,
  path: '/emails',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${config.api_key}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(data)
  }
};

const req = https.request(options, (res) => {
  let responseData = '';

  res.on('data', (chunk) => {
    responseData += chunk;
  });

  res.on('end', () => {
    if (res.statusCode === 200) {
      console.log('✅ Email sent successfully!');
      console.log('Response:', responseData);
    } else {
      console.error('❌ Failed to send email');
      console.error('Status:', res.statusCode);
      console.error('Response:', responseData);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Error sending email:', error);
});

req.write(data);
req.end();
