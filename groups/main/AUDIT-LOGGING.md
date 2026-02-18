# Audit Logging System

## Overview

The Audit Logging System is the security foundation for Andy, providing comprehensive tracking of all system actions for security monitoring, compliance, debugging, and user activity tracking.

## Features

### ✅ Complete Event Tracking
- **WhatsApp Messages**: All messages sent and received
- **File Operations**: Read, write, edit, delete operations
- **API Calls**: Twilio, Google Calendar, Gmail integrations
- **Tasks**: Creation, updates, status changes
- **Calendar**: Event CRUD operations
- **Email**: Read and send operations
- **Phone Calls**: Call initiation and completion
- **System Events**: Errors, start, shutdown
- **Access Control**: Granted and denied access attempts

### ✅ Security Features
- **Immutable Logs**: Append-only JSONL format
- **Unique Event IDs**: UUID for each event
- **Session Tracking**: Session IDs for correlation
- **Timestamp Precision**: ISO 8601 timestamps
- **Severity Levels**: DEBUG, INFO, WARN, ERROR, CRITICAL
- **Metadata**: Process ID, Node version, platform

### ✅ Query & Analysis
- Query by event type
- Query by severity
- Query by date range
- Statistics generation
- Export capabilities

## Architecture

### Storage
- **Format**: JSONL (JSON Lines) - one JSON object per line
- **Location**: `/workspace/group/audit-logs/`
- **Naming**: `audit-YYYY-MM-DD.jsonl` (daily rotation)
- **Size**: Automatic daily rotation, no size limits

### Event Structure
```json
{
  "id": "uuid",
  "timestamp": "2026-02-09T12:00:00.000Z",
  "sessionId": "session-uuid",
  "eventType": "message.sent",
  "severity": "info",
  "data": {
    "to": "user@example.com",
    "messageId": "msg123",
    "preview": "Message content..."
  },
  "metadata": {
    "processId": 123,
    "nodeVersion": "v22.22.0",
    "platform": "linux"
  }
}
```

## Usage

### Basic Usage

```javascript
const { auditLogger } = require('./audit-logger');

// Log a message sent
auditLogger.messageSent('user@example.com', 'msg123', 'Hello world');

// Log a file write
auditLogger.fileWrite('/path/to/file.txt', 1024);

// Log an API call
auditLogger.apiCall('twilio', '/Calls', 'POST', 200, 350);

// Log a task created
auditLogger.taskCreated(12345, 'Important Task', 'high');

// Log a system error
auditLogger.systemError(new Error('Something failed'), { action: 'process_message' });
```

### Advanced Usage

```javascript
const { auditLogger, EventTypes, Severity } = require('./audit-logger');

// Custom event logging
auditLogger.log(
    EventTypes.CUSTOM_EVENT,
    Severity.INFO,
    { customData: 'value' },
    { additionalMetadata: 'info' }
);
```

### Query Logs

```bash
# Run test and generate sample data
node audit-logger.js test

# List all log files
node audit-logger.js list

# Get today's statistics
node audit-logger.js stats

# Get statistics for date range
node audit-logger.js stats 2026-02-09 2026-02-10

# Query by event type
node audit-logger.js query message.sent 2026-02-09

# Query across date range
node audit-logger.js query api.call 2026-02-09 2026-02-15
```

### Programmatic Queries

```javascript
const { AuditQuery } = require('./audit-logger');

// Read logs for specific date
const logs = AuditQuery.readLogsForDate(new Date('2026-02-09'));

// Query by event type
const messages = AuditQuery.queryByEventType(
    'message.sent',
    new Date('2026-02-09'),
    new Date('2026-02-09')
);

// Query by severity
const errors = AuditQuery.queryBySeverity(
    'error',
    new Date('2026-02-09'),
    new Date('2026-02-09')
);

// Get statistics
const stats = AuditQuery.getStatistics(
    new Date('2026-02-09'),
    new Date('2026-02-09')
);
```

## Event Types Reference

### WhatsApp
- `message.received` - Message received from user
- `message.sent` - Message sent to user

### Files
- `file.read` - File read operation
- `file.write` - File created/written
- `file.edit` - File edited
- `file.delete` - File deleted

### API
- `api.call` - External API call made
- `api.error` - API call failed

### Tasks
- `task.created` - New task created
- `task.updated` - Task updated
- `task.deleted` - Task deleted
- `task.status_changed` - Task status changed

### Calendar
- `calendar.read` - Calendar accessed
- `calendar.event.created` - Calendar event created
- `calendar.event.updated` - Calendar event updated
- `calendar.event.deleted` - Calendar event deleted

### Email
- `email.read` - Email accessed
- `email.sent` - Email sent

### Phone
- `phone.call.initiated` - Phone call started
- `phone.call.completed` - Phone call finished

### System
- `system.start` - System started
- `system.error` - System error occurred
- `system.shutdown` - System shutdown

### Auth (Future)
- `auth.login` - User logged in
- `auth.logout` - User logged out
- `auth.failed` - Login failed

### Access Control
- `access.granted` - Access granted to resource
- `access.denied` - Access denied to resource

## Severity Levels

- **DEBUG**: Development/debugging information
- **INFO**: Normal operational events
- **WARN**: Warning conditions
- **ERROR**: Error conditions
- **CRITICAL**: Critical failures requiring immediate attention

## Compliance

### SOC 2 Requirements
✅ **Audit Trail**: Complete audit trail of all system activities
✅ **Data Integrity**: Immutable append-only logs
✅ **Access Monitoring**: Track all access attempts
✅ **Change Tracking**: Log all data modifications
✅ **Incident Response**: Error and critical event tracking

### GDPR Requirements
✅ **Data Access Tracking**: Log all personal data access
✅ **Right to be Forgotten**: Track data deletion operations
✅ **Data Export**: Export audit logs on demand
✅ **Breach Notification**: Track and alert on security events

## Viewer Dashboard

Open `audit-viewer.html` in a web browser to view logs visually:
- Filter by event type
- Filter by severity
- View statistics
- Browse logs by date

## Security Best Practices

1. **Access Control**: Restrict access to audit log directory
2. **Backup**: Regular backups of audit logs
3. **Retention**: Define retention policy (recommend 90+ days)
4. **Monitoring**: Set up alerts for critical events
5. **Review**: Regular review of error and warning events

## Performance

- **Writes**: Async append operations, minimal overhead
- **Storage**: ~1KB per event, ~10MB per 10,000 events
- **Queries**: Fast for single-day queries, use date filtering for ranges
- **Rotation**: Automatic daily rotation prevents large files

## Integration Examples

### With Existing Code

```javascript
// In your message handler
const { auditLogger } = require('./audit-logger');

function handleMessage(from, message) {
    auditLogger.messageReceived(from, message.id, message.body);

    // Process message...
    const response = processMessage(message);

    auditLogger.messageSent(from, response.id, response.body);
}
```

### Error Handling

```javascript
try {
    await riskyOperation();
} catch (error) {
    auditLogger.systemError(error, {
        operation: 'riskyOperation',
        user: currentUser
    });
    throw error;
}
```

## Future Enhancements

- [ ] Real-time log streaming
- [ ] Alert system for critical events
- [ ] Log encryption at rest
- [ ] Log forwarding to SIEM
- [ ] Automatic log archival
- [ ] Advanced analytics dashboard
- [ ] Anomaly detection
- [ ] Compliance report generation

## Testing

Run comprehensive tests:
```bash
node audit-logger.js test
```

This will:
1. Create sample events of all types
2. Generate statistics
3. Show log file location
4. Verify query capabilities

## Support

For questions or issues:
- Check the audit log files in `/workspace/group/audit-logs/`
- Use the query commands to investigate
- Review the viewer dashboard for visual analysis
