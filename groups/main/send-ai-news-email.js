#!/usr/bin/env node

const https = require('https');
const fs = require('fs');

// Read email config
const config = JSON.parse(fs.readFileSync('/workspace/group/email-config.json', 'utf8'));

// Function to search web and compile results
async function searchWeb(query) {
  // This would use web search API - placeholder for now
  // In the actual recurring task, Andy will perform the web searches
  return {
    query,
    results: []
  };
}

// Function to send email via Resend
function sendEmail(subject, htmlContent) {
  return new Promise((resolve, reject) => {
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
          resolve(JSON.parse(responseData));
        } else {
          reject(new Error(`Failed to send email: ${res.statusCode} - ${responseData}`));
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(data);
    req.end();
  });
}

// Read the summary from a file or stdin
const summaryFile = process.argv[2];
let htmlContent = '';

if (summaryFile && fs.existsSync(summaryFile)) {
  htmlContent = fs.readFileSync(summaryFile, 'utf8');
} else {
  console.error('Usage: send-ai-news-email.js <html-file>');
  process.exit(1);
}

// Send the email
const subject = 'AI in Accounting & Finance - Daily News Summary';
sendEmail(subject, htmlContent)
  .then((result) => {
    console.log('✅ Email sent successfully!');
    console.log('Email ID:', result.id);
  })
  .catch((error) => {
    console.error('❌ Failed to send email:', error.message);
    process.exit(1);
  });
