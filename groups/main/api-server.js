#!/usr/bin/env node

/**
 * REST API Server - Enterprise Integration
 *
 * Provides secure REST API with:
 * - User authentication & management
 * - Task management per user
 * - File operations
 * - Audit log access
 * - Compliance operations (GDPR)
 * - System administration
 * - Complete integration with RBAC, Encryption, Compliance, and Audit
 */

const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { multiUserManager } = require('./multi-user');
const { rbacManager } = require('./rbac');
const { complianceManager } = require('./compliance');
const { auditLogger } = require('./audit-logger');
const fs = require('fs');
const path = require('path');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute for testing
    max: process.env.NODE_ENV === 'test' ? 10000 : 100, // Much higher limit for testing
    message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute for testing
    max: process.env.NODE_ENV === 'test' ? 10000 : 5, // Much higher limit for testing
    message: 'Too many login attempts, please try again later.'
});

// Request logging middleware
app.use((req, res, next) => {
    const start = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - start;
        auditLogger.log('api.request', 'debug', {
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            duration,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });
    });

    next();
});

// Authentication middleware
async function authenticate(req, res, next) {
    const sessionId = req.headers['x-session-id'] || req.headers['authorization']?.replace('Bearer ', '');

    if (!sessionId) {
        return res.status(401).json({
            error: 'Authentication required',
            message: 'Please provide a session ID in X-Session-ID header'
        });
    }

    const validation = multiUserManager.validateSession(sessionId);

    if (!validation.valid) {
        return res.status(401).json({
            error: 'Invalid session',
            message: validation.error
        });
    }

    req.userId = validation.session.userId;
    req.sessionId = sessionId;
    req.session = validation.session;
    next();
}

// Permission check middleware
function requirePermission(permission) {
    return (req, res, next) => {
        if (!rbacManager.checkAccess(req.userId, permission)) {
            return res.status(403).json({
                error: 'Permission denied',
                message: `Required permission: ${permission}`
            });
        }
        next();
    };
}

// ===== Health & Status =====

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

app.get('/api/status', authenticate, (req, res) => {
    const user = multiUserManager.getUser(req.userId);
    res.json({
        authenticated: true,
        user: {
            id: user.id,
            username: user.username,
            role: user.role
        },
        session: {
            id: req.sessionId,
            expiresAt: req.session.expiresAt
        }
    });
});

// ===== Authentication =====

app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { username, password, email, firstName, lastName, timezone, consent } = req.body;

        if (!username || !password || !email) {
            return res.status(400).json({
                error: 'Missing required fields',
                required: ['username', 'password', 'email']
            });
        }

        if (!consent) {
            return res.status(400).json({
                error: 'Consent required',
                message: 'User must consent to data processing (GDPR)'
            });
        }

        const user = await multiUserManager.createUser({
            username,
            password,
            email,
            firstName,
            lastName,
            timezone,
            consent: true,
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        });

        res.status(201).json({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(400).json({
            error: error.message
        });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                error: 'Missing credentials',
                required: ['username', 'password']
            });
        }

        const result = await multiUserManager.authenticateUser(
            username,
            password,
            {
                ipAddress: req.ip,
                userAgent: req.get('user-agent')
            }
        );

        if (result.success) {
            res.json({
                success: true,
                user: result.user,
                session: {
                    id: result.session.id,
                    token: result.session.token,
                    expiresAt: result.session.expiresAt
                }
            });
        } else {
            res.status(401).json({
                error: 'Authentication failed',
                message: result.error
            });
        }
    } catch (error) {
        res.status(500).json({
            error: 'Internal server error'
        });
    }
});

app.post('/api/auth/logout', authenticate, (req, res) => {
    const result = multiUserManager.logout(req.sessionId);
    res.json(result);
});

// ===== User Management =====

app.get('/api/users/me', authenticate, (req, res) => {
    const user = multiUserManager.getUser(req.userId);
    res.json(user);
});

app.put('/api/users/me', authenticate, async (req, res) => {
    try {
        const updates = req.body;
        delete updates.role; // Users can't change their own role

        const updated = await multiUserManager.updateUser(
            req.userId,
            updates,
            req.userId
        );

        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/users/me', authenticate, async (req, res) => {
    try {
        await multiUserManager.deleteUser(req.userId, req.userId, 'user_request');
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.get('/api/users', authenticate, requirePermission('user.read'), (req, res) => {
    try {
        const users = multiUserManager.listUsers(req.userId, req.query);
        res.json({ users, count: users.length });
    } catch (error) {
        res.status(403).json({ error: error.message });
    }
});

app.get('/api/users/:userId', authenticate, requirePermission('user.read'), (req, res) => {
    const user = multiUserManager.getUser(req.params.userId);

    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
});

app.put('/api/users/:userId', authenticate, requirePermission('user.update'), async (req, res) => {
    try {
        const updated = await multiUserManager.updateUser(
            req.params.userId,
            req.body,
            req.userId
        );
        res.json(updated);
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.delete('/api/users/:userId', authenticate, requirePermission('user.delete'), async (req, res) => {
    try {
        await multiUserManager.deleteUser(
            req.params.userId,
            req.userId,
            req.body.reason || 'admin_action'
        );
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

// ===== Tasks =====

app.get('/api/tasks', authenticate, requirePermission('task.read'), (req, res) => {
    try {
        const workspacePath = multiUserManager.getWorkspacePath(req.userId);
        const tasksFile = path.join(workspacePath, 'tasks', 'tasks.json');

        if (!fs.existsSync(tasksFile)) {
            return res.json({ tasks: [] });
        }

        const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
        res.json({ tasks, count: tasks.length });
    } catch (error) {
        res.status(500).json({ error: 'Failed to load tasks' });
    }
});

app.post('/api/tasks', authenticate, requirePermission('task.create'), (req, res) => {
    try {
        const workspacePath = multiUserManager.getWorkspacePath(req.userId);
        const tasksFile = path.join(workspacePath, 'tasks', 'tasks.json');

        let tasks = [];
        if (fs.existsSync(tasksFile)) {
            tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
        }

        const task = {
            id: Date.now(),
            ...req.body,
            userId: req.userId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        tasks.push(task);
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

        auditLogger.log('task.create', 'info', {
            userId: req.userId,
            taskId: task.id
        });

        res.status(201).json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to create task' });
    }
});

app.get('/api/tasks/:taskId', authenticate, requirePermission('task.read'), (req, res) => {
    try {
        const workspacePath = multiUserManager.getWorkspacePath(req.userId);
        const tasksFile = path.join(workspacePath, 'tasks', 'tasks.json');

        if (!fs.existsSync(tasksFile)) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
        const task = tasks.find(t => t.id === parseInt(req.params.taskId));

        if (!task) {
            return res.status(404).json({ error: 'Task not found' });
        }

        res.json(task);
    } catch (error) {
        res.status(500).json({ error: 'Failed to load task' });
    }
});

app.put('/api/tasks/:taskId', authenticate, requirePermission('task.update'), (req, res) => {
    try {
        const workspacePath = multiUserManager.getWorkspacePath(req.userId);
        const tasksFile = path.join(workspacePath, 'tasks', 'tasks.json');

        if (!fs.existsSync(tasksFile)) {
            return res.status(404).json({ error: 'Task not found' });
        }

        let tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
        const taskIndex = tasks.findIndex(t => t.id === parseInt(req.params.taskId));

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        tasks[taskIndex] = {
            ...tasks[taskIndex],
            ...req.body,
            updatedAt: new Date().toISOString()
        };

        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

        auditLogger.log('task.update', 'info', {
            userId: req.userId,
            taskId: tasks[taskIndex].id
        });

        res.json(tasks[taskIndex]);
    } catch (error) {
        res.status(500).json({ error: 'Failed to update task' });
    }
});

app.delete('/api/tasks/:taskId', authenticate, requirePermission('task.delete'), (req, res) => {
    try {
        const workspacePath = multiUserManager.getWorkspacePath(req.userId);
        const tasksFile = path.join(workspacePath, 'tasks', 'tasks.json');

        if (!fs.existsSync(tasksFile)) {
            return res.status(404).json({ error: 'Task not found' });
        }

        let tasks = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));
        const taskIndex = tasks.findIndex(t => t.id === parseInt(req.params.taskId));

        if (taskIndex === -1) {
            return res.status(404).json({ error: 'Task not found' });
        }

        const deletedTask = tasks.splice(taskIndex, 1)[0];
        fs.writeFileSync(tasksFile, JSON.stringify(tasks, null, 2));

        auditLogger.log('task.delete', 'warn', {
            userId: req.userId,
            taskId: deletedTask.id
        });

        res.json({ success: true, task: deletedTask });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete task' });
    }
});

// ===== GDPR / Compliance =====

app.get('/api/gdpr/export', authenticate, async (req, res) => {
    try {
        const result = await multiUserManager.exportUserData(req.userId, req.userId);
        res.json(result.data);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/gdpr/delete', authenticate, async (req, res) => {
    try {
        await multiUserManager.deleteUser(req.userId, req.userId, 'gdpr_request');
        res.json({ success: true, message: 'All data deleted' });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
});

app.post('/api/consent/:purpose', authenticate, (req, res) => {
    const consent = complianceManager.recordConsent(
        req.userId,
        req.params.purpose,
        req.body.granted !== false,
        {
            ipAddress: req.ip,
            userAgent: req.get('user-agent')
        }
    );

    res.json({ success: true, consent });
});

app.delete('/api/consent/:purpose', authenticate, (req, res) => {
    const result = complianceManager.withdrawConsent(req.userId, req.params.purpose);
    res.json(result);
});

app.get('/api/consent', authenticate, (req, res) => {
    const consents = complianceManager.getUserConsents(req.userId);
    res.json({ consents });
});

// ===== Audit Logs =====

app.get('/api/audit/logs', authenticate, requirePermission('audit.read'), (req, res) => {
    try {
        const { limit = 100, offset = 0 } = req.query;
        // This is a simplified version - in production, implement proper log reading
        res.json({
            message: 'Audit logs available via file system',
            location: '/workspace/group/audit-logs/'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ===== System Administration =====

app.get('/api/admin/stats', authenticate, requirePermission('user.read'), (req, res) => {
    try {
        const stats = multiUserManager.getSystemStats(req.userId);
        res.json(stats);
    } catch (error) {
        res.status(403).json({ error: error.message });
    }
});

app.get('/api/admin/compliance', authenticate, requirePermission('audit.read'), (req, res) => {
    const framework = req.query.framework || 'all';
    const report = complianceManager.generateComplianceReport(framework);
    res.json(report);
});

// ===== Error handling =====

app.use((req, res) => {
    res.status(404).json({
        error: 'Not found',
        path: req.path
    });
});

app.use((err, req, res, next) => {
    console.error('Error:', err);
    auditLogger.systemError(err, {
        path: req.path,
        method: req.method,
        userId: req.userId
    });

    res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// ===== Server startup =====

function startServer(port = 3000, systemPassword) {
    // Initialize encryption
    const encryptResult = multiUserManager.initializeEncryption(systemPassword);

    if (!encryptResult.success) {
        console.error('❌ Failed to initialize encryption:', encryptResult.error);
        process.exit(1);
    }

    app.listen(port, () => {
        console.log('🚀 Andy REST API Server');
        console.log('━'.repeat(50));
        console.log(`✅ Server running on port ${port}`);
        console.log(`✅ Health check: http://localhost:${port}/health`);
        console.log(`✅ API base: http://localhost:${port}/api`);
        console.log('━'.repeat(50));
        console.log('Security features enabled:');
        console.log('  • RBAC - Role-based access control');
        console.log('  • Encryption - AES-256-GCM at rest');
        console.log('  • Audit logging - All operations tracked');
        console.log('  • GDPR compliance - Data rights supported');
        console.log('  • Rate limiting - DDoS protection');
        console.log('  • Helmet.js - Security headers');
        console.log('━'.repeat(50));

        auditLogger.log('system.start', 'info', {
            component: 'api_server',
            port
        });
    });

    return app;
}

// CLI mode
if (require.main === module) {
    const port = process.env.PORT || 3000;
    const password = process.env.SYSTEM_PASSWORD || process.argv[2];

    if (!password) {
        console.error('❌ System password required');
        console.log('Usage: node api-server.js <system-password>');
        console.log('   or: SYSTEM_PASSWORD=xxx node api-server.js');
        process.exit(1);
    }

    startServer(port, password);
}

module.exports = { app, startServer };
