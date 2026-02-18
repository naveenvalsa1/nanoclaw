#!/usr/bin/env node

/**
 * Gmail Integration for Andy
 *
 * Provides email access functionality (read, search, send, label, archive)
 * Account: naveenvalsa@gmail.com (personal Gmail)
 */

const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// Paths
const CREDENTIALS_PATH = path.join(__dirname, 'google-gmail-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'google-gmail-token.json');
const STATE_PATH = path.join(__dirname, 'gmail-state.json');

// OAuth scopes — modify allows read, label, archive, send (but not delete)
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

// ─── Auth ────────────────────────────────────────────────────────────────────

async function getGmailClient() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        throw new Error('No google-credentials.json found. Place it in the group directory.');
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    // Auto-save refreshed tokens
    oAuth2Client.on('tokens', (tokens) => {
        try {
            const existing = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            const merged = { ...existing, ...tokens };
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged));
        } catch {}
    });

    if (!fs.existsSync(TOKEN_PATH)) {
        throw new Error('No Gmail token found. Run: node gmail.js setup');
    }

    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    oAuth2Client.setCredentials(token);
    return google.gmail({ version: 'v1', auth: oAuth2Client });
}

async function setupOAuth() {
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
    const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });

    console.log('Authorize this app by visiting this URL:\n');
    console.log(authUrl);
    console.log();

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const code = await new Promise((resolve) => {
        rl.question('Enter the authorization code: ', (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });

    const { tokens } = await oAuth2Client.getToken(code);
    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
    console.log(JSON.stringify({ success: true, message: 'Gmail token saved.' }));
}

// ─── State Management ────────────────────────────────────────────────────────

function loadState() {
    try {
        return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    } catch {
        return { lastCheckedHistoryId: null, lastDigestSent: null, notifiedMessageIds: [] };
    }
}

function saveState(state) {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArgs(args) {
    const parsed = {};
    const positional = [];
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            // Flags with no value (next arg is also a flag or end of args)
            if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
                parsed[key] = true;
            } else {
                parsed[key] = args[i + 1];
                i++;
            }
        } else {
            positional.push(args[i]);
        }
    }
    return { ...parsed, _positional: positional };
}

function decodeBody(payload) {
    // Try to get text/plain first, then text/html
    if (!payload) return '';

    if (payload.body && payload.body.data) {
        return Buffer.from(payload.body.data, 'base64url').toString('utf8');
    }

    if (payload.parts) {
        // Prefer text/plain
        const textPart = payload.parts.find(p => p.mimeType === 'text/plain');
        if (textPart && textPart.body && textPart.body.data) {
            return Buffer.from(textPart.body.data, 'base64url').toString('utf8');
        }

        // Fall back to text/html
        const htmlPart = payload.parts.find(p => p.mimeType === 'text/html');
        if (htmlPart && htmlPart.body && htmlPart.body.data) {
            return Buffer.from(htmlPart.body.data, 'base64url').toString('utf8');
        }

        // Recurse into multipart
        for (const part of payload.parts) {
            if (part.parts) {
                const result = decodeBody(part);
                if (result) return result;
            }
        }
    }

    return '';
}

function getHeader(headers, name) {
    const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
    return header ? header.value : '';
}

function formatMessage(msg) {
    const headers = msg.payload ? msg.payload.headers || [] : [];
    return {
        id: msg.id,
        threadId: msg.threadId,
        labelIds: msg.labelIds || [],
        snippet: msg.snippet || '',
        from: getHeader(headers, 'From'),
        to: getHeader(headers, 'To'),
        cc: getHeader(headers, 'Cc'),
        subject: getHeader(headers, 'Subject'),
        date: getHeader(headers, 'Date'),
        internalDate: msg.internalDate,
        isUnread: (msg.labelIds || []).includes('UNREAD'),
    };
}

function formatMessageFull(msg) {
    const base = formatMessage(msg);
    base.body = decodeBody(msg.payload);

    // Extract attachment info
    const attachments = [];
    function walkParts(parts) {
        if (!parts) return;
        for (const part of parts) {
            if (part.filename && part.filename.length > 0) {
                attachments.push({
                    filename: part.filename,
                    mimeType: part.mimeType,
                    size: part.body ? part.body.size : 0,
                });
            }
            if (part.parts) walkParts(part.parts);
        }
    }
    if (msg.payload) walkParts(msg.payload.parts);
    base.attachments = attachments;
    base.historyId = msg.historyId;

    return base;
}

function parseDuration(str) {
    // Parse "24h", "7d", "1w" etc into a Date
    const match = str.match(/^(\d+)([hdwm])$/);
    if (!match) return null;
    const [, num, unit] = match;
    const now = new Date();
    const amount = parseInt(num);
    switch (unit) {
        case 'h': now.setHours(now.getHours() - amount); break;
        case 'd': now.setDate(now.getDate() - amount); break;
        case 'w': now.setDate(now.getDate() - amount * 7); break;
        case 'm': now.setMonth(now.getMonth() - amount); break;
    }
    return now;
}

function buildRFC2822Message({ to, cc, subject, body, inReplyTo, references, threadSubject }) {
    const lines = [];
    lines.push(`To: ${to}`);
    if (cc) lines.push(`Cc: ${cc}`);
    lines.push(`Subject: ${subject}`);
    lines.push('Content-Type: text/plain; charset=utf-8');
    if (inReplyTo) {
        lines.push(`In-Reply-To: ${inReplyTo}`);
        lines.push(`References: ${references || inReplyTo}`);
    }
    lines.push('');
    lines.push(body);

    return Buffer.from(lines.join('\r\n')).toString('base64url');
}

// ─── Commands ────────────────────────────────────────────────────────────────

async function listMessages(gmail, opts = {}) {
    const queryParts = [];
    if (opts.unread) queryParts.push('is:unread');
    if (opts.after) {
        const afterDate = parseDuration(opts.after);
        if (afterDate) {
            const epoch = Math.floor(afterDate.getTime() / 1000);
            queryParts.push(`after:${epoch}`);
        }
    }
    if (opts.query) queryParts.push(opts.query);

    const params = {
        userId: 'me',
        maxResults: parseInt(opts.max) || 20,
    };
    if (queryParts.length > 0) params.q = queryParts.join(' ');

    const res = await gmail.users.messages.list(params);
    const messages = res.data.messages || [];

    // Fetch metadata for each message
    const detailed = await Promise.all(
        messages.map(m =>
            gmail.users.messages.get({
                userId: 'me',
                id: m.id,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
            }).then(r => formatMessage(r.data))
        )
    );

    return detailed;
}

async function readMessage(gmail, messageId) {
    const res = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
    });
    return formatMessageFull(res.data);
}

async function readThread(gmail, threadId) {
    const res = await gmail.users.threads.get({
        userId: 'me',
        id: threadId,
        format: 'full',
    });
    return {
        id: res.data.id,
        historyId: res.data.historyId,
        messages: (res.data.messages || []).map(formatMessageFull),
    };
}

async function searchMessages(gmail, query, max = 20) {
    const res = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: max,
    });
    const messages = res.data.messages || [];

    const detailed = await Promise.all(
        messages.map(m =>
            gmail.users.messages.get({
                userId: 'me',
                id: m.id,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
            }).then(r => formatMessage(r.data))
        )
    );

    return detailed;
}

async function getStats(gmail) {
    const profile = await gmail.users.getProfile({ userId: 'me' });

    // Count unread
    const unread = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: 1,
    });

    // Count inbox
    const inbox = await gmail.users.messages.list({
        userId: 'me',
        labelIds: ['INBOX'],
        maxResults: 1,
    });

    // Get labels
    const labels = await gmail.users.labels.list({ userId: 'me' });

    return {
        emailAddress: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal,
        threadsTotal: profile.data.threadsTotal,
        historyId: profile.data.historyId,
        unreadEstimate: unread.data.resultSizeEstimate || 0,
        inboxEstimate: inbox.data.resultSizeEstimate || 0,
        labels: (labels.data.labels || []).map(l => ({ id: l.id, name: l.name, type: l.type })),
    };
}

async function modifyLabels(gmail, messageId, addLabels, removeLabels) {
    const res = await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
            addLabelIds: addLabels || [],
            removeLabelIds: removeLabels || [],
        },
    });
    return { success: true, id: res.data.id, labelIds: res.data.labelIds };
}

async function archiveMessage(gmail, messageId) {
    return modifyLabels(gmail, messageId, [], ['INBOX']);
}

async function markRead(gmail, messageId) {
    return modifyLabels(gmail, messageId, [], ['UNREAD']);
}

async function replyToMessage(gmail, messageId, body) {
    // Get original message for threading
    const original = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'metadata',
        metadataHeaders: ['From', 'To', 'Subject', 'Message-ID', 'References'],
    });

    const headers = original.data.payload.headers;
    const from = getHeader(headers, 'From');
    const subject = getHeader(headers, 'Subject');
    const messageIdHeader = getHeader(headers, 'Message-ID');
    const references = getHeader(headers, 'References');

    const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;

    const raw = buildRFC2822Message({
        to: from,
        subject: replySubject,
        body: body,
        inReplyTo: messageIdHeader,
        references: references ? `${references} ${messageIdHeader}` : messageIdHeader,
    });

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: raw,
            threadId: original.data.threadId,
        },
    });

    return { success: true, id: res.data.id, threadId: res.data.threadId };
}

async function sendMessage(gmail, { to, cc, subject, body }) {
    const raw = buildRFC2822Message({ to, cc, subject, body });

    const res = await gmail.users.messages.send({
        userId: 'me',
        requestBody: { raw },
    });

    return { success: true, id: res.data.id, threadId: res.data.threadId };
}

async function getHistory(gmail, startHistoryId) {
    const res = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: startHistoryId,
        historyTypes: ['messageAdded'],
    });

    const history = res.data.history || [];
    const newHistoryId = res.data.historyId;

    // Collect unique new message IDs
    const messageIds = new Set();
    for (const entry of history) {
        if (entry.messagesAdded) {
            for (const added of entry.messagesAdded) {
                // Only include inbox messages (skip sent, drafts, etc.)
                if (added.message.labelIds && added.message.labelIds.includes('INBOX')) {
                    messageIds.add(added.message.id);
                }
            }
        }
    }

    // Fetch metadata for new messages
    const messages = await Promise.all(
        [...messageIds].map(id =>
            gmail.users.messages.get({
                userId: 'me',
                id: id,
                format: 'metadata',
                metadataHeaders: ['From', 'To', 'Cc', 'Subject', 'Date'],
            }).then(r => formatMessage(r.data))
        )
    );

    return {
        newHistoryId,
        newMessages: messages,
        count: messages.length,
    };
}

// ─── CLI ─────────────────────────────────────────────────────────────────────

if (require.main === module) {
    const args = process.argv.slice(2);
    const command = args[0];

    if (!command) {
        console.log('Usage: node gmail.js <command> [options]');
        console.log('\nRead commands:');
        console.log('  list [--unread] [--after "24h"] [--query "..."] [--max N]');
        console.log('  read <messageId>');
        console.log('  thread <threadId>');
        console.log('  search "<gmail query>" [--max N]');
        console.log('  stats');
        console.log('  history --since-id <historyId>');
        console.log('\nWrite commands:');
        console.log('  label <messageId> --add "Label" --remove "Label"');
        console.log('  archive <messageId>');
        console.log('  markread <messageId>');
        console.log('  reply <messageId> --body "..."');
        console.log('  send --to "..." --subject "..." --body "..." [--cc "..."]');
        console.log('\nSetup:');
        console.log('  setup   (one-time OAuth flow)');
        process.exit(1);
    }

    (async () => {
        try {
            if (command === 'setup') {
                await setupOAuth();
                return;
            }

            const gmail = await getGmailClient();
            const parsed = parseArgs(args.slice(1));

            switch (command) {
                case 'list': {
                    const result = await listMessages(gmail, {
                        unread: parsed.unread,
                        after: parsed.after,
                        query: parsed.query,
                        max: parsed.max,
                    });
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'read': {
                    const msgId = parsed._positional[0];
                    if (!msgId) { console.error('Usage: read <messageId>'); process.exit(1); }
                    const result = await readMessage(gmail, msgId);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'thread': {
                    const threadId = parsed._positional[0];
                    if (!threadId) { console.error('Usage: thread <threadId>'); process.exit(1); }
                    const result = await readThread(gmail, threadId);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'search': {
                    const query = parsed._positional[0];
                    if (!query) { console.error('Usage: search "<query>"'); process.exit(1); }
                    const result = await searchMessages(gmail, query, parseInt(parsed.max) || 20);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'stats': {
                    const result = await getStats(gmail);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'history': {
                    const sinceId = parsed['since-id'];
                    if (!sinceId) { console.error('Usage: history --since-id <historyId>'); process.exit(1); }
                    const result = await getHistory(gmail, sinceId);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'label': {
                    const msgId = parsed._positional[0];
                    if (!msgId) { console.error('Usage: label <messageId> --add "Label" --remove "Label"'); process.exit(1); }
                    const addLabels = parsed.add ? [parsed.add] : [];
                    const removeLabels = parsed.remove ? [parsed.remove] : [];
                    const result = await modifyLabels(gmail, msgId, addLabels, removeLabels);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'archive': {
                    const msgId = parsed._positional[0];
                    if (!msgId) { console.error('Usage: archive <messageId>'); process.exit(1); }
                    const result = await archiveMessage(gmail, msgId);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'markread': {
                    const msgId = parsed._positional[0];
                    if (!msgId) { console.error('Usage: markread <messageId>'); process.exit(1); }
                    const result = await markRead(gmail, msgId);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'reply': {
                    const msgId = parsed._positional[0];
                    if (!msgId || !parsed.body) {
                        console.error('Usage: reply <messageId> --body "..."');
                        process.exit(1);
                    }
                    const result = await replyToMessage(gmail, msgId, parsed.body);
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                case 'send': {
                    if (!parsed.to || !parsed.subject || !parsed.body) {
                        console.error('Usage: send --to "..." --subject "..." --body "..."');
                        process.exit(1);
                    }
                    const result = await sendMessage(gmail, {
                        to: parsed.to,
                        cc: parsed.cc,
                        subject: parsed.subject,
                        body: parsed.body,
                    });
                    console.log(JSON.stringify(result, null, 2));
                    break;
                }
                default:
                    console.error(`Unknown command: ${command}`);
                    process.exit(1);
            }
        } catch (error) {
            console.error(JSON.stringify({ error: error.message }));
            process.exit(1);
        }
    })();
}

module.exports = {
    getGmailClient,
    listMessages,
    readMessage,
    readThread,
    searchMessages,
    getStats,
    modifyLabels,
    archiveMessage,
    markRead,
    replyToMessage,
    sendMessage,
    getHistory,
    loadState,
    saveState,
};
