#!/usr/bin/env node

/**
 * Google Calendar OAuth Setup
 * Run this once to authorize Andy to access your calendar
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const http = require('http');
const url = require('url');

const CREDENTIALS_PATH = path.join(__dirname, 'google-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'google-calendar-token.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar'];

async function setupCalendar() {
    console.log('🗓️  Google Calendar Setup for Andy\n');

    // Check for credentials
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.log('❌ Credentials file not found!');
        console.log('\n📝 Steps to get credentials:');
        console.log('1. Go to: https://console.cloud.google.com/');
        console.log('2. Create a new project (or select existing)');
        console.log('3. Enable Google Calendar API');
        console.log('4. Create OAuth 2.0 credentials (Desktop app)');
        console.log('5. Download JSON file');
        console.log('6. Save as: google-credentials.json');
        console.log('7. Place in: /workspace/group/\n');
        process.exit(1);
    }

    // Load credentials
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

    const REDIRECT_URI = 'http://localhost:3001/oauth2callback';
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, REDIRECT_URI);

    // Generate auth URL
    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',  // Force refresh token generation
    });

    console.log('📱 Opening authorization page...\n');
    console.log('If browser doesn\'t open, visit this URL:');
    console.log(authUrl);
    console.log('');

    // Start local server to receive OAuth callback
    const server = http.createServer(async (req, res) => {
        if (req.url.indexOf('/oauth2callback') > -1) {
            const qs = new url.URL(req.url, 'http://localhost:3001').searchParams;
            const code = qs.get('code');

            res.end('✅ Authorization successful! You can close this window.');

            server.close();

            // Exchange code for token
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);

            // Save token
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));

            console.log('\n✅ Authorization successful!');
            console.log('🎉 Andy can now access your Google Calendar!');
            console.log('\n📋 Token saved to:', TOKEN_PATH);
            console.log('\n💡 Try: node google-calendar.js today');

            process.exit(0);
        }
    }).listen(3001, () => {
        console.log('⏳ Waiting for authorization...');

        // Try to open browser automatically
        const open = require('child_process').exec;
        const platform = process.platform;

        if (platform === 'darwin') {
            open(`open "${authUrl}"`);
        } else if (platform === 'win32') {
            open(`start "${authUrl}"`);
        } else {
            open(`xdg-open "${authUrl}"`);
        }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
        console.log('\n❌ Timeout: Authorization not completed');
        server.close();
        process.exit(1);
    }, 300000);
}

setupCalendar().catch(console.error);
