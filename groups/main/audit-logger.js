#!/usr/bin/env node

/**
 * Audit Logger - Security & Compliance Foundation
 *
 * Tracks all system actions for:
 * - Security monitoring
 * - Compliance (SOC2, GDPR)
 * - Debugging
 * - User activity tracking
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Audit log storage
const AUDIT_LOG_DIR = path.join(__dirname, 'audit-logs');
const CURRENT_LOG_FILE = path.join(AUDIT_LOG_DIR, `audit-${new Date().toISOString().split('T')[0]}.jsonl`);

// Ensure audit log directory exists
if (!fs.existsSync(AUDIT_LOG_DIR)) {
    fs.mkdirSync(AUDIT_LOG_DIR, { recursive: true });
}

/**
 * Event types for categorization
 */
const EventTypes = {
    // WhatsApp
    MESSAGE_RECEIVED: 'message.received',
    MESSAGE_SENT: 'message.sent',

    // File operations
    FILE_READ: 'file.read',
    FILE_WRITE: 'file.write',
    FILE_EDIT: 'file.edit',
    FILE_DELETE: 'file.delete',

    // API calls
    API_CALL: 'api.call',
    API_ERROR: 'api.error',

    // Tasks
    TASK_CREATED: 'task.created',
    TASK_UPDATED: 'task.updated',
    TASK_DELETED: 'task.deleted',
    TASK_STATUS_CHANGED: 'task.status_changed',

    // Calendar
    CALENDAR_READ: 'calendar.read',
    CALENDAR_EVENT_CREATED: 'calendar.event.created',
    CALENDAR_EVENT_UPDATED: 'calendar.event.updated',
    CALENDAR_EVENT_DELETED: 'calendar.event.deleted',

    // Email
    EMAIL_READ: 'email.read',
    EMAIL_SENT: 'email.sent',

    // Phone
    PHONE_CALL_INITIATED: 'phone.call.initiated',
    PHONE_CALL_COMPLETED: 'phone.call.completed',

    // System
    SYSTEM_START: 'system.start',
    SYSTEM_ERROR: 'system.error',
    SYSTEM_SHUTDOWN: 'system.shutdown',

    // Auth (for future)
    AUTH_LOGIN: 'auth.login',
    AUTH_LOGOUT: 'auth.logout',
    AUTH_FAILED: 'auth.failed',

    // Access control
    ACCESS_GRANTED: 'access.granted',
    ACCESS_DENIED: 'access.denied'
};

/**
 * Severity levels
 */
const Severity = {
    DEBUG: 'debug',
    INFO: 'info',
    WARN: 'warn',
    ERROR: 'error',
    CRITICAL: 'critical'
};

/**
 * Audit Logger Class
 */
class AuditLogger {
    constructor() {
        this.sessionId = this.generateSessionId();
    }

    /**
     * Generate unique session ID
     */
    generateSessionId() {
        return crypto.randomBytes(16).toString('hex');
    }

    /**
     * Log an audit event
     * @param {string} eventType - Event type from EventTypes
     * @param {string} severity - Severity level
     * @param {object} data - Event-specific data
     * @param {object} metadata - Additional metadata
     */
    log(eventType, severity, data = {}, metadata = {}) {
        const event = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            sessionId: this.sessionId,
            eventType,
            severity,
            data,
            metadata: {
                ...metadata,
                processId: process.pid,
                nodeVersion: process.version,
                platform: process.platform
            }
        };

        // Write to daily log file (append)
        const logLine = JSON.stringify(event) + '\n';
        fs.appendFileSync(CURRENT_LOG_FILE, logLine);

        // Also log to console for development
        if (process.env.NODE_ENV !== 'production') {
            const color = this.getSeverityColor(severity);
            console.log(`${color}[AUDIT] ${eventType}${'\x1b[0m'}`, data);
        }

        return event.id;
    }

    /**
     * Get color code for severity
     */
    getSeverityColor(severity) {
        const colors = {
            debug: '\x1b[36m',    // Cyan
            info: '\x1b[32m',     // Green
            warn: '\x1b[33m',     // Yellow
            error: '\x1b[31m',    // Red
            critical: '\x1b[35m'  // Magenta
        };
        return colors[severity] || '\x1b[0m';
    }

    // ===== Convenience methods for common events =====

    /**
     * Log WhatsApp message received
     */
    messageReceived(from, messageId, preview) {
        return this.log(EventTypes.MESSAGE_RECEIVED, Severity.INFO, {
            from,
            messageId,
            preview: preview.substring(0, 100)
        });
    }

    /**
     * Log WhatsApp message sent
     */
    messageSent(to, messageId, preview) {
        return this.log(EventTypes.MESSAGE_SENT, Severity.INFO, {
            to,
            messageId,
            preview: preview.substring(0, 100)
        });
    }

    /**
     * Log file read
     */
    fileRead(filePath, size) {
        return this.log(EventTypes.FILE_READ, Severity.DEBUG, {
            filePath,
            size
        });
    }

    /**
     * Log file write
     */
    fileWrite(filePath, size) {
        return this.log(EventTypes.FILE_WRITE, Severity.INFO, {
            filePath,
            size
        });
    }

    /**
     * Log file edit
     */
    fileEdit(filePath, oldSize, newSize) {
        return this.log(EventTypes.FILE_EDIT, Severity.INFO, {
            filePath,
            oldSize,
            newSize
        });
    }

    /**
     * Log API call
     */
    apiCall(service, endpoint, method, statusCode, duration) {
        const severity = statusCode >= 400 ? Severity.ERROR : Severity.INFO;
        return this.log(EventTypes.API_CALL, severity, {
            service,
            endpoint,
            method,
            statusCode,
            duration
        });
    }

    /**
     * Log task created
     */
    taskCreated(taskId, title, priority) {
        return this.log(EventTypes.TASK_CREATED, Severity.INFO, {
            taskId,
            title,
            priority
        });
    }

    /**
     * Log task updated
     */
    taskUpdated(taskId, changes) {
        return this.log(EventTypes.TASK_UPDATED, Severity.INFO, {
            taskId,
            changes
        });
    }

    /**
     * Log task status changed
     */
    taskStatusChanged(taskId, oldStatus, newStatus) {
        return this.log(EventTypes.TASK_STATUS_CHANGED, Severity.INFO, {
            taskId,
            oldStatus,
            newStatus
        });
    }

    /**
     * Log calendar event created
     */
    calendarEventCreated(eventId, summary, start) {
        return this.log(EventTypes.CALENDAR_EVENT_CREATED, Severity.INFO, {
            eventId,
            summary,
            start
        });
    }

    /**
     * Log phone call initiated
     */
    phoneCallInitiated(to, callSid, purpose) {
        return this.log(EventTypes.PHONE_CALL_INITIATED, Severity.INFO, {
            to,
            callSid,
            purpose
        });
    }

    /**
     * Log phone call completed
     */
    phoneCallCompleted(callSid, duration, status) {
        return this.log(EventTypes.PHONE_CALL_COMPLETED, Severity.INFO, {
            callSid,
            duration,
            status
        });
    }

    /**
     * Log email sent
     */
    emailSent(to, subject, messageId) {
        return this.log(EventTypes.EMAIL_SENT, Severity.INFO, {
            to,
            subject,
            messageId
        });
    }

    /**
     * Log system error
     */
    systemError(error, context) {
        return this.log(EventTypes.SYSTEM_ERROR, Severity.ERROR, {
            error: error.message,
            stack: error.stack,
            context
        });
    }

    /**
     * Log access denied
     */
    accessDenied(resource, reason) {
        return this.log(EventTypes.ACCESS_DENIED, Severity.WARN, {
            resource,
            reason
        });
    }
}

/**
 * Query audit logs
 */
class AuditQuery {
    /**
     * Read logs from a specific date
     */
    static readLogsForDate(date) {
        const dateStr = date.toISOString().split('T')[0];
        const logFile = path.join(AUDIT_LOG_DIR, `audit-${dateStr}.jsonl`);

        if (!fs.existsSync(logFile)) {
            return [];
        }

        const content = fs.readFileSync(logFile, 'utf8');
        return content.trim().split('\n').map(line => JSON.parse(line));
    }

    /**
     * Query logs by event type
     */
    static queryByEventType(eventType, startDate, endDate) {
        const logs = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayLogs = this.readLogsForDate(d);
            logs.push(...dayLogs.filter(log => log.eventType === eventType));
        }

        return logs;
    }

    /**
     * Query logs by severity
     */
    static queryBySeverity(severity, startDate, endDate) {
        const logs = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            const dayLogs = this.readLogsForDate(d);
            logs.push(...dayLogs.filter(log => log.severity === severity));
        }

        return logs;
    }

    /**
     * Get statistics for a date range
     */
    static getStatistics(startDate, endDate) {
        const logs = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            logs.push(...this.readLogsForDate(d));
        }

        const stats = {
            total: logs.length,
            byEventType: {},
            bySeverity: {},
            errors: logs.filter(l => l.severity === Severity.ERROR || l.severity === Severity.CRITICAL).length
        };

        logs.forEach(log => {
            stats.byEventType[log.eventType] = (stats.byEventType[log.eventType] || 0) + 1;
            stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
        });

        return stats;
    }

    /**
     * List all available log files
     */
    static listLogFiles() {
        if (!fs.existsSync(AUDIT_LOG_DIR)) {
            return [];
        }
        return fs.readdirSync(AUDIT_LOG_DIR).filter(f => f.startsWith('audit-') && f.endsWith('.jsonl'));
    }
}

// Export singleton instance
const auditLogger = new AuditLogger();

module.exports = {
    auditLogger,
    AuditLogger,
    AuditQuery,
    EventTypes,
    Severity
};

// CLI interface
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'query') {
        const eventType = process.argv[3];
        const startDate = process.argv[4] || new Date().toISOString().split('T')[0];
        const endDate = process.argv[5] || startDate;

        const logs = AuditQuery.queryByEventType(eventType, startDate, endDate);
        console.log(JSON.stringify(logs, null, 2));
    } else if (command === 'stats') {
        const startDate = process.argv[3] || new Date().toISOString().split('T')[0];
        const endDate = process.argv[4] || startDate;

        const stats = AuditQuery.getStatistics(startDate, endDate);
        console.log(JSON.stringify(stats, null, 2));
    } else if (command === 'list') {
        const files = AuditQuery.listLogFiles();
        console.log('Available audit log files:');
        files.forEach(f => console.log(`  ${f}`));
    } else if (command === 'test') {
        // Run test
        console.log('Running audit logger test...\n');

        auditLogger.messageReceived('user@example.com', 'msg123', 'Test message content');
        auditLogger.messageSent('user@example.com', 'msg124', 'Response message');
        auditLogger.fileRead('/path/to/file.txt', 1024);
        auditLogger.fileWrite('/path/to/output.txt', 2048);
        auditLogger.taskCreated(12345, 'Test Task', 'high');
        auditLogger.apiCall('twilio', '/Calls', 'POST', 200, 350);
        auditLogger.phoneCallInitiated('+1234567890', 'CA123', 'Test call');
        auditLogger.systemError(new Error('Test error'), { action: 'test' });

        console.log('\nTest complete! Check the log file:');
        console.log(CURRENT_LOG_FILE);

        console.log('\nToday\'s statistics:');
        const stats = AuditQuery.getStatistics(new Date(), new Date());
        console.log(JSON.stringify(stats, null, 2));
    } else {
        console.log('Audit Logger CLI');
        console.log('\nUsage:');
        console.log('  node audit-logger.js test                    - Run test');
        console.log('  node audit-logger.js list                    - List log files');
        console.log('  node audit-logger.js stats [start] [end]     - Get statistics');
        console.log('  node audit-logger.js query <type> [start] [end] - Query by event type');
        console.log('\nExample:');
        console.log('  node audit-logger.js test');
        console.log('  node audit-logger.js stats 2026-02-09 2026-02-09');
        console.log('  node audit-logger.js query message.sent 2026-02-09');
    }
}
