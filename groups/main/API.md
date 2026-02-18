# REST API Documentation

## Overview

Andy REST API provides secure, enterprise-grade endpoints for user management, task management, GDPR compliance, and system administration. All security modules (RBAC, Encryption, Compliance, Audit) are fully integrated.

**Base URL**: `http://localhost:3000/api`

## Security Features

✅ **Authentication**: Session-based with token validation
✅ **Authorization**: RBAC permission checks on all endpoints
✅ **Encryption**: AES-256-GCM for data at rest
✅ **Rate Limiting**: DDoS protection (100 req/15min, 5 auth attempts/15min)
✅ **Security Headers**: Helmet.js protection
✅ **Audit Logging**: All operations tracked
✅ **GDPR Compliance**: Data export, deletion, consent management

## Authentication

All API requests (except registration and login) require a valid session token.

**Header**: `X-Session-ID: <token>`
**Alternative**: `Authorization: Bearer <token>`

### Register

Create a new user account.

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "john",
  "password": "securePassword123",
  "email": "john@example.com",
  "firstName": "John",        // Optional
  "lastName": "Doe",          // Optional
  "timezone": "America/New_York", // Optional
  "consent": true             // Required (GDPR)
}
```

**Response** (201 Created):
```json
{
  "success": true,
  "user": {
    "id": "user-abc123",
    "username": "john",
    "email": "john@example.com",
    "role": "user"
  }
}
```

**Errors**:
- `400`: Missing required fields, consent not granted
- `429`: Rate limit exceeded (5 registrations per 15 minutes)

### Login

Authenticate and receive session token.

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "john",
  "password": "securePassword123"
}
```

**Response** (200 OK):
```json
{
  "success": true,
  "user": {
    "id": "user-abc123",
    "username": "john",
    "email": "john@example.com",
    "role": "user",
    "profile": {
      "firstName": "John",
      "lastName": "Doe",
      "timezone": "America/New_York"
    },
    "status": "active",
    "lastLogin": "2026-02-09T14:00:00Z",
    "loginCount": 5
  },
  "session": {
    "id": "session-xyz789",
    "token": "secure-random-token",
    "expiresAt": "2026-02-10T14:00:00Z"
  }
}
```

**Errors**:
- `400`: Missing credentials
- `401`: Invalid credentials, account inactive
- `429`: Rate limit exceeded (5 attempts per 15 minutes)

### Logout

Invalidate current session.

```http
POST /api/auth/logout
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "success": true
}
```

## User Management

### Get Current User Profile

```http
GET /api/users/me
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "id": "user-abc123",
  "username": "john",
  "email": "john@example.com",
  "role": "user",
  "profile": {
    "firstName": "John",
    "lastName": "Doe",
    "timezone": "America/New_York",
    "preferences": {}
  },
  "status": "active",
  "createdAt": "2026-01-01T00:00:00Z",
  "lastLogin": "2026-02-09T14:00:00Z",
  "loginCount": 5
}
```

### Update Current User Profile

```http
PUT /api/users/me
X-Session-ID: <token>
Content-Type: application/json

{
  "profile": {
    "firstName": "Johnny",
    "preferences": { "theme": "dark" }
  },
  "password": "newPassword123"  // Optional
}
```

**Response** (200 OK): Updated user object

**Note**: Users cannot change their own role.

### Delete Current User Account

```http
DELETE /api/users/me
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Account deleted"
}
```

**Note**: Applies GDPR deletion - all user data is removed.

### List All Users

**Permission**: `user.read` (admin, super_admin)

```http
GET /api/users?role=admin&status=active
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "users": [
    {
      "id": "user-abc123",
      "username": "john",
      "email": "john@example.com",
      "role": "user",
      "status": "active"
    }
  ],
  "count": 1
}
```

**Query Parameters**:
- `role`: Filter by role (admin, user, readonly)
- `status`: Filter by status (active, inactive)

### Get User by ID

**Permission**: `user.read`

```http
GET /api/users/:userId
X-Session-ID: <token>
```

**Response** (200 OK): User object
**Errors**: `404` User not found, `403` Permission denied

### Update User

**Permission**: `user.update`

```http
PUT /api/users/:userId
X-Session-ID: <token>
Content-Type: application/json

{
  "profile": { "firstName": "Updated" },
  "role": "admin"  // Only if you have permission
}
```

**Response** (200 OK): Updated user object

### Delete User

**Permission**: `user.delete`

```http
DELETE /api/users/:userId
X-Session-ID: <token>
Content-Type: application/json

{
  "reason": "admin_action"  // Optional: user_request, gdpr_request, admin_action
}
```

**Response** (200 OK):
```json
{
  "success": true
}
```

## Task Management

Tasks are stored per-user in isolated workspaces.

### List Tasks

**Permission**: `task.read`

```http
GET /api/tasks
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "tasks": [
    {
      "id": 1770647482394,
      "title": "Complete project",
      "description": "Finish the API documentation",
      "status": "pending",
      "userId": "user-abc123",
      "createdAt": "2026-02-09T14:00:00Z",
      "updatedAt": "2026-02-09T14:00:00Z"
    }
  ],
  "count": 1
}
```

### Create Task

**Permission**: `task.create`

```http
POST /api/tasks
X-Session-ID: <token>
Content-Type: application/json

{
  "title": "New Task",
  "description": "Task description",
  "status": "pending",
  "priority": "high",
  "dueDate": "2026-02-15T00:00:00Z"
}
```

**Response** (201 Created): Created task object

### Get Task by ID

**Permission**: `task.read`

```http
GET /api/tasks/:taskId
X-Session-ID: <token>
```

**Response** (200 OK): Task object
**Errors**: `404` Task not found

### Update Task

**Permission**: `task.update`

```http
PUT /api/tasks/:taskId
X-Session-ID: <token>
Content-Type: application/json

{
  "status": "completed",
  "notes": "Task completed successfully"
}
```

**Response** (200 OK): Updated task object

### Delete Task

**Permission**: `task.delete`

```http
DELETE /api/tasks/:taskId
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "task": { /* deleted task */ }
}
```

## GDPR / Compliance

### Export User Data

**Right to Access** (GDPR Article 15)

```http
GET /api/gdpr/export
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "exportDate": "2026-02-09T14:00:00Z",
  "userId": "user-abc123",
  "regulation": "GDPR Article 15 - Right to Access",
  "data": {
    "profile": { /* user profile */ },
    "tasks": [ /* all user tasks */ ],
    "auditLogs": [ /* user activity */ ],
    "consents": [ /* consent records */ ],
    "metadata": { /* additional data */ }
  }
}
```

### Delete User Data

**Right to Erasure** (GDPR Article 17)

```http
POST /api/gdpr/delete
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "All data deleted"
}
```

**Note**: Deletes all user data including profile, tasks, workspace, and sessions. Audit logs are anonymized but retained for compliance.

### Record Consent

```http
POST /api/consent/:purpose
X-Session-ID: <token>
Content-Type: application/json

{
  "granted": true  // or false to deny
}
```

**Example purposes**: `email_marketing`, `data_processing`, `analytics`

**Response** (200 OK):
```json
{
  "success": true,
  "consent": {
    "id": "consent-xyz",
    "userId": "user-abc123",
    "purpose": "email_marketing",
    "granted": true,
    "timestamp": "2026-02-09T14:00:00Z",
    "ipAddress": "192.168.1.1"
  }
}
```

### Withdraw Consent

```http
DELETE /api/consent/:purpose
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "success": true,
  "message": "Consent withdrawn"
}
```

### Get Consent Records

```http
GET /api/consent
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "consents": [
    {
      "id": "consent-xyz",
      "purpose": "email_marketing",
      "granted": false,
      "timestamp": "2026-02-09T14:00:00Z"
    }
  ]
}
```

## System Administration

### Get System Statistics

**Permission**: `user.read`

```http
GET /api/admin/stats
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "users": {
    "total": 10,
    "active": 8,
    "inactive": 2,
    "byRole": {
      "admin": 2,
      "user": 7,
      "readonly": 1
    }
  },
  "sessions": {
    "total": 15,
    "active": 8,
    "expired": 7
  },
  "timestamp": "2026-02-09T14:00:00Z"
}
```

### Get Compliance Report

**Permission**: `audit.read`

```http
GET /api/admin/compliance?framework=GDPR
X-Session-ID: <token>
```

**Query Parameters**:
- `framework`: `all`, `GDPR`, `SOC2`, `HIPAA`, `PCI`

**Response** (200 OK):
```json
{
  "generatedAt": "2026-02-09T14:00:00Z",
  "framework": "GDPR",
  "compliance": {
    "GDPR": {
      "framework": "GDPR",
      "requirements": {
        "rightToAccess": true,
        "rightToRectification": true,
        "rightToErasure": true,
        "dataMinimization": true,
        "consentManagement": true,
        "breachNotification": true,
        "encryption": true
      },
      "overallCompliance": "Compliant"
    }
  }
}
```

### Get Audit Logs

**Permission**: `audit.read`

```http
GET /api/audit/logs?limit=100&offset=0
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "message": "Audit logs available via file system",
  "location": "/workspace/group/audit-logs/"
}
```

**Note**: For production, implement proper log reading with filtering and pagination.

## Health & Status

### Health Check

No authentication required.

```http
GET /health
```

**Response** (200 OK):
```json
{
  "status": "healthy",
  "timestamp": "2026-02-09T14:00:00Z",
  "version": "1.0.0"
}
```

### Auth Status

```http
GET /api/status
X-Session-ID: <token>
```

**Response** (200 OK):
```json
{
  "authenticated": true,
  "user": {
    "id": "user-abc123",
    "username": "john",
    "role": "user"
  },
  "session": {
    "id": "session-xyz789",
    "expiresAt": "2026-02-10T14:00:00Z"
  }
}
```

## Error Responses

### Standard Error Format

```json
{
  "error": "Error type",
  "message": "Detailed error message"
}
```

### HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (permission denied)
- `404` - Not Found
- `429` - Too Many Requests (rate limit)
- `500` - Internal Server Error

## Rate Limits

### General API

- **Limit**: 100 requests per 15 minutes per IP
- **Window**: 15 minutes
- **Header**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`

### Authentication Endpoints

- **Limit**: 5 attempts per 15 minutes per IP
- **Window**: 15 minutes
- **Applies to**: `/api/auth/register`, `/api/auth/login`

**Response** (429 Too Many Requests):
```json
{
  "error": "Too many requests from this IP, please try again later."
}
```

## Example Workflows

### Complete User Registration & Task Creation

```javascript
// 1. Register
const register = await fetch('http://localhost:3000/api/auth/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'john',
    password: 'securePass123',
    email: 'john@example.com',
    consent: true
  })
});

// 2. Login
const login = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'john',
    password: 'securePass123'
  })
});
const { session } = await login.json();

// 3. Create Task
const task = await fetch('http://localhost:3000/api/tasks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Session-ID': session.token
  },
  body: JSON.stringify({
    title: 'My First Task',
    status: 'pending'
  })
});

// 4. Get Tasks
const tasks = await fetch('http://localhost:3000/api/tasks', {
  headers: { 'X-Session-ID': session.token }
});

// 5. Logout
await fetch('http://localhost:3000/api/auth/logout', {
  method: 'POST',
  headers: { 'X-Session-ID': session.token }
});
```

### GDPR Data Export & Deletion

```javascript
// Login
const login = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'john', password: 'pass' })
});
const { session } = await login.json();

// Export all data (GDPR Article 15)
const exported = await fetch('http://localhost:3000/api/gdpr/export', {
  headers: { 'X-Session-ID': session.token }
});
const data = await exported.json();
// Save data to file or display to user

// Delete account (GDPR Article 17)
await fetch('http://localhost:3000/api/gdpr/delete', {
  method: 'POST',
  headers: { 'X-Session-ID': session.token }
});
// All user data is now deleted
```

## Running the Server

### Start Server

```bash
node api-server.js <system-password>
```

**Or with environment variable:**

```bash
SYSTEM_PASSWORD=yourSecurePassword node api-server.js
```

**With options:**

```bash
PORT=4000 SYSTEM_PASSWORD=password NODE_ENV=production node api-server.js password
```

### Environment Variables

- `PORT` - Server port (default: 3000)
- `SYSTEM_PASSWORD` - Master encryption password (required)
- `NODE_ENV` - Environment (`development`, `production`, `test`)
- `ALLOWED_ORIGINS` - CORS allowed origins (comma-separated)

### Testing

```bash
# Run test suite
node test-api.js
```

**Tests include:**
1. ✅ Health check
2. ✅ User registration
3. ✅ User login
4. ✅ Get profile
5. ✅ Create task
6. ✅ Get tasks
7. ✅ Update task
8. ✅ Get consent records
9. ✅ GDPR data export
10. ✅ Auth status check
11. ✅ Logout
12. ✅ Access after logout (should fail)

## Security Best Practices

### API Keys

✅ **Never log or expose** session tokens
✅ **Store securely** in environment variables
✅ **Rotate regularly** (24-hour expiration)
✅ **Use HTTPS** in production

### Rate Limiting

✅ **Monitor** rate limit headers
✅ **Implement backoff** when rate limited
✅ **Cache responses** where appropriate

### Error Handling

✅ **Never expose** internal error details in production
✅ **Log all errors** for debugging
✅ **Return generic messages** to clients

### GDPR Compliance

✅ **Obtain explicit consent** before data processing
✅ **Provide data export** within 30 days
✅ **Delete data** within reasonable timeframe
✅ **Keep audit trail** of all data access

## Production Deployment

### Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use strong `SYSTEM_PASSWORD`
- [ ] Enable HTTPS (reverse proxy)
- [ ] Configure `ALLOWED_ORIGINS` for CORS
- [ ] Set up log rotation
- [ ] Configure backup strategy
- [ ] Monitor audit logs
- [ ] Set up alerting for errors
- [ ] Rate limit configuration
- [ ] Database connection pooling (if using external DB)

### Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl;
    server_name api.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Process Manager (PM2)

```bash
pm2 start api-server.js --name andy-api -- <password>
pm2 save
pm2 startup
```

## Support

**Files:**
- `/workspace/group/api-server.js` - Main server
- `/workspace/group/test-api.js` - Test suite

**Dependencies:**
- `express` - Web framework
- `cors` - CORS middleware
- `helmet` - Security headers
- `express-rate-limit` - Rate limiting

For questions or issues, check the audit logs at `/workspace/group/audit-logs/`.
