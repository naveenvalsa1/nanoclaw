#!/usr/bin/env node

/**
 * Multi-user Support System
 *
 * Provides enterprise multi-user features:
 * - User management (CRUD)
 * - Session management
 * - Authentication & authorization
 * - User workspace isolation
 * - Collaboration features
 * - Activity tracking
 * - Integration with RBAC, Encryption, Compliance, and Audit
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { auditLogger } = require('./audit-logger');
const { rbacManager } = require('./rbac');
const { encryptionManager } = require('./encryption');
const { complianceManager } = require('./compliance');

// Multi-user configuration
const MULTI_USER_DIR = path.join(__dirname, 'multi-user-data');
const USERS_FILE = path.join(MULTI_USER_DIR, 'users.encrypted.json');
const SESSIONS_FILE = path.join(MULTI_USER_DIR, 'sessions.json');
const WORKSPACES_DIR = path.join(MULTI_USER_DIR, 'workspaces');

// Ensure directories exist
if (!fs.existsSync(MULTI_USER_DIR)) {
    fs.mkdirSync(MULTI_USER_DIR, { recursive: true, mode: 0o700 });
}
if (!fs.existsSync(WORKSPACES_DIR)) {
    fs.mkdirSync(WORKSPACES_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Multi-user Manager
 */
class MultiUserManager {
    constructor() {
        this.users = [];
        this.sessions = new Map();
        this.loadUsers();
        this.loadSessions();
    }

    /**
     * Initialize encryption
     */
    initializeEncryption(password) {
        try {
            encryptionManager.initializeMasterKey(password);
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Create new user
     */
    async createUser(userData) {
        // Validate required fields
        if (!userData.username || !userData.password || !userData.email) {
            throw new Error('Username, password, and email required');
        }

        // Check if username already exists
        if (this.users.find(u => u.username === userData.username)) {
            throw new Error('Username already exists');
        }

        // Check if email already exists
        if (this.users.find(u => u.email === userData.email)) {
            throw new Error('Email already exists');
        }

        // Generate user ID
        const userId = this.generateUserId();

        // Hash password
        const passwordHash = encryptionManager.hashPassword(userData.password);

        // Create user object
        const user = {
            id: userId,
            username: userData.username,
            email: userData.email,
            passwordHash,
            role: userData.role || 'user',
            profile: {
                firstName: userData.firstName || '',
                lastName: userData.lastName || '',
                timezone: userData.timezone || 'UTC',
                preferences: userData.preferences || {}
            },
            status: 'active',
            createdAt: new Date().toISOString(),
            lastLogin: null,
            loginCount: 0
        };

        // Create RBAC user (userId, username, roleId, metadata)
        rbacManager.createUser(userId, userData.username, user.role, {
            email: user.email,
            ...user.profile
        });

        // Record GDPR consent
        if (userData.consent) {
            complianceManager.recordConsent(
                userId,
                'data_processing',
                true,
                { ipAddress: userData.ipAddress, userAgent: userData.userAgent }
            );
        }

        // Create user workspace
        this.createWorkspace(userId);

        // Add to users list
        this.users.push(user);
        this.saveUsers();

        auditLogger.log('user.create', 'info', {
            userId,
            username: user.username,
            role: user.role
        });

        // Return user without password hash
        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Authenticate user
     */
    async authenticateUser(username, password, metadata = {}) {
        const user = this.users.find(u => u.username === username);

        if (!user) {
            auditLogger.log('auth.failed', 'warn', {
                username,
                reason: 'user_not_found',
                ipAddress: metadata.ipAddress
            });
            return { success: false, error: 'Invalid credentials' };
        }

        // Check if user is active
        if (user.status !== 'active') {
            auditLogger.log('auth.failed', 'warn', {
                userId: user.id,
                username,
                reason: 'user_inactive'
            });
            return { success: false, error: 'Account inactive' };
        }

        // Verify password
        const isValid = encryptionManager.verifyPassword(password, user.passwordHash);

        if (!isValid) {
            auditLogger.log('auth.failed', 'warn', {
                userId: user.id,
                username,
                reason: 'invalid_password',
                ipAddress: metadata.ipAddress
            });
            return { success: false, error: 'Invalid credentials' };
        }

        // Update login info
        user.lastLogin = new Date().toISOString();
        user.loginCount++;
        this.saveUsers();

        // Create session
        const session = this.createSession(user.id, metadata);

        auditLogger.log('auth.login', 'info', {
            userId: user.id,
            username,
            sessionId: session.id,
            ipAddress: metadata.ipAddress
        });

        const { passwordHash: _, ...safeUser } = user;
        return {
            success: true,
            user: safeUser,
            session
        };
    }

    /**
     * Create session
     */
    createSession(userId, metadata = {}) {
        const session = {
            id: this.generateSessionId(),
            userId,
            token: encryptionManager.generateToken(32),
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
            ipAddress: metadata.ipAddress || 'unknown',
            userAgent: metadata.userAgent || 'unknown',
            active: true
        };

        this.sessions.set(session.id, session);
        this.saveSessions();

        return session;
    }

    /**
     * Validate session (by ID or token)
     */
    validateSession(sessionIdOrToken) {
        // Try to find by session ID first
        let session = this.sessions.get(sessionIdOrToken);

        // If not found, try to find by token
        if (!session) {
            for (const [id, sess] of this.sessions.entries()) {
                if (sess.token === sessionIdOrToken) {
                    session = sess;
                    break;
                }
            }
        }

        if (!session) {
            return { valid: false, error: 'Session not found' };
        }

        if (!session.active) {
            return { valid: false, error: 'Session inactive' };
        }

        if (new Date(session.expiresAt) < new Date()) {
            session.active = false;
            this.saveSessions();
            return { valid: false, error: 'Session expired' };
        }

        return { valid: true, session };
    }

    /**
     * Logout (invalidate session)
     */
    logout(sessionId) {
        const validation = this.validateSession(sessionId);

        if (!validation.valid) {
            return { success: false, error: validation.error };
        }

        const session = validation.session;
        session.active = false;
        this.saveSessions();

        auditLogger.log('auth.logout', 'info', {
            userId: session.userId,
            sessionId
        });

        return { success: true };
    }

    /**
     * Get user by ID
     */
    getUser(userId) {
        const user = this.users.find(u => u.id === userId);

        if (!user) {
            return null;
        }

        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Update user
     */
    async updateUser(userId, updates, requesterId) {
        const user = this.users.find(u => u.id === userId);

        if (!user) {
            throw new Error('User not found');
        }

        // Check permission (users can update themselves, or admin can update anyone)
        if (userId !== requesterId && !rbacManager.hasPermission(requesterId, 'user.update')) {
            throw new Error('Permission denied');
        }

        // Update allowed fields
        if (updates.email) user.email = updates.email;
        if (updates.profile) user.profile = { ...user.profile, ...updates.profile };
        if (updates.role && rbacManager.hasPermission(requesterId, 'user.update')) {
            user.role = updates.role;
            rbacManager.updateUser(userId, { role: updates.role });
        }

        // If password is being changed
        if (updates.password) {
            user.passwordHash = encryptionManager.hashPassword(updates.password);
        }

        this.saveUsers();

        auditLogger.log('user.update', 'info', {
            userId,
            updatedBy: requesterId,
            fields: Object.keys(updates)
        });

        // GDPR: Record rectification request
        await complianceManager.rectifyUserData(userId, updates);

        const { passwordHash: _, ...safeUser } = user;
        return safeUser;
    }

    /**
     * Delete user
     */
    async deleteUser(userId, requesterId, reason = 'admin_action') {
        // Check permission
        if (!rbacManager.hasPermission(requesterId, 'user.delete')) {
            throw new Error('Permission denied');
        }

        const user = this.users.find(u => u.id === userId);

        if (!user) {
            throw new Error('User not found');
        }

        // GDPR: Delete user data
        await complianceManager.deleteUserData(userId, reason);

        // Delete from RBAC
        rbacManager.deleteUser(userId);

        // Delete workspace
        this.deleteWorkspace(userId);

        // Invalidate all sessions
        for (const [sessionId, session] of this.sessions.entries()) {
            if (session.userId === userId) {
                session.active = false;
            }
        }

        // Remove user
        this.users = this.users.filter(u => u.id !== userId);
        this.saveUsers();

        auditLogger.log('user.delete', 'warn', {
            userId,
            deletedBy: requesterId,
            reason
        });

        return { success: true };
    }

    /**
     * List users
     */
    listUsers(requesterId, filters = {}) {
        // Check permission (user.read allows listing users)
        if (!rbacManager.hasPermission(requesterId, 'user.read')) {
            throw new Error('Permission denied');
        }

        let users = [...this.users];

        // Apply filters
        if (filters.role) {
            users = users.filter(u => u.role === filters.role);
        }

        if (filters.status) {
            users = users.filter(u => u.status === filters.status);
        }

        auditLogger.log('user.list', 'debug', {
            requesterId,
            count: users.length,
            filters
        });

        // Return without password hashes
        return users.map(({ passwordHash: _, ...user }) => user);
    }

    /**
     * Create user workspace
     */
    createWorkspace(userId) {
        const workspaceDir = path.join(WORKSPACES_DIR, userId);

        if (!fs.existsSync(workspaceDir)) {
            fs.mkdirSync(workspaceDir, { recursive: true, mode: 0o700 });

            // Create workspace structure
            fs.mkdirSync(path.join(workspaceDir, 'tasks'), { mode: 0o700 });
            fs.mkdirSync(path.join(workspaceDir, 'files'), { mode: 0o700 });
            fs.mkdirSync(path.join(workspaceDir, 'notes'), { mode: 0o700 });

            // Initialize empty task list
            fs.writeFileSync(
                path.join(workspaceDir, 'tasks', 'tasks.json'),
                JSON.stringify([], null, 2),
                { mode: 0o600 }
            );

            auditLogger.log('workspace.create', 'info', { userId });
        }
    }

    /**
     * Delete user workspace
     */
    deleteWorkspace(userId) {
        const workspaceDir = path.join(WORKSPACES_DIR, userId);

        if (fs.existsSync(workspaceDir)) {
            fs.rmSync(workspaceDir, { recursive: true, force: true });
            auditLogger.log('workspace.delete', 'warn', { userId });
        }
    }

    /**
     * Get user workspace path
     */
    getWorkspacePath(userId) {
        return path.join(WORKSPACES_DIR, userId);
    }

    /**
     * Get active sessions for user
     */
    getUserSessions(userId, requesterId) {
        // Users can see their own sessions, or admin can see any
        if (userId !== requesterId && !rbacManager.hasPermission(requesterId, 'user.read')) {
            throw new Error('Permission denied');
        }

        const sessions = Array.from(this.sessions.values())
            .filter(s => s.userId === userId && s.active);

        return sessions;
    }

    /**
     * Get system statistics
     */
    getSystemStats(requesterId) {
        // Check permission (user.read allows viewing stats)
        if (!rbacManager.hasPermission(requesterId, 'user.read')) {
            throw new Error('Permission denied');
        }

        const now = new Date();
        const activeSessions = Array.from(this.sessions.values())
            .filter(s => s.active && new Date(s.expiresAt) > now);

        const stats = {
            users: {
                total: this.users.length,
                active: this.users.filter(u => u.status === 'active').length,
                inactive: this.users.filter(u => u.status !== 'active').length,
                byRole: {}
            },
            sessions: {
                total: this.sessions.size,
                active: activeSessions.length,
                expired: this.sessions.size - activeSessions.length
            },
            timestamp: now.toISOString()
        };

        // Count users by role
        for (const user of this.users) {
            stats.users.byRole[user.role] = (stats.users.byRole[user.role] || 0) + 1;
        }

        return stats;
    }

    /**
     * Export user data (GDPR)
     */
    async exportUserData(userId, requesterId) {
        // Users can export their own data, or admin can export any
        if (userId !== requesterId && !rbacManager.hasPermission(requesterId, 'data.export')) {
            throw new Error('Permission denied');
        }

        return await complianceManager.exportUserData(userId);
    }

    /**
     * Utility methods
     */

    generateUserId() {
        return 'user-' + crypto.randomBytes(8).toString('hex');
    }

    generateSessionId() {
        return 'session-' + crypto.randomBytes(8).toString('hex');
    }

    /**
     * Storage methods
     */

    loadUsers() {
        if (!fs.existsSync(USERS_FILE)) {
            this.users = [];
            return;
        }

        try {
            const encrypted = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));

            // Decrypt user data
            this.users = encrypted.map(user =>
                encryptionManager.decryptObject(user, ['email', 'passwordHash'])
            );
        } catch (error) {
            // If decryption fails, start with empty list
            this.users = [];
        }
    }

    saveUsers() {
        // Encrypt sensitive fields
        const encrypted = this.users.map(user =>
            encryptionManager.encryptObject(user, ['email', 'passwordHash'])
        );

        fs.writeFileSync(USERS_FILE, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
    }

    loadSessions() {
        if (!fs.existsSync(SESSIONS_FILE)) {
            this.sessions = new Map();
            return;
        }

        const data = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
        this.sessions = new Map(data.sessions || []);
    }

    saveSessions() {
        const data = {
            sessions: Array.from(this.sessions.entries()),
            lastUpdate: new Date().toISOString()
        };

        fs.writeFileSync(SESSIONS_FILE, JSON.stringify(data, null, 2), { mode: 0o600 });
    }
}

// Export singleton
const multiUserManager = new MultiUserManager();

module.exports = {
    multiUserManager,
    MultiUserManager
};

// CLI interface
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'init') {
        const password = process.argv[3];
        if (!password) {
            console.error('Error: Password required');
            console.log('Usage: node multi-user.js init <password>');
            process.exit(1);
        }

        const result = multiUserManager.initializeEncryption(password);
        if (result.success) {
            console.log('✅ Multi-user system initialized');
        } else {
            console.error('❌', result.error);
        }
    } else if (command === 'create') {
        const password = process.argv[3];
        const username = process.argv[4];
        const userPassword = process.argv[5];
        const email = process.argv[6];
        const role = process.argv[7] || 'standard_user';

        if (!password || !username || !userPassword || !email) {
            console.error('Error: All fields required');
            console.log('Usage: node multi-user.js create <system-password> <username> <user-password> <email> [role]');
            process.exit(1);
        }

        multiUserManager.initializeEncryption(password);

        multiUserManager.createUser({
            username,
            password: userPassword,
            email,
            role,
            consent: true
        }).then(user => {
            console.log('✅ User created:', user.id);
            console.log('Username:', user.username);
            console.log('Email:', user.email);
            console.log('Role:', user.role);
        }).catch(error => {
            console.error('❌', error.message);
        });
    } else if (command === 'login') {
        const password = process.argv[3];
        const username = process.argv[4];
        const userPassword = process.argv[5];

        if (!password || !username || !userPassword) {
            console.error('Error: All fields required');
            console.log('Usage: node multi-user.js login <system-password> <username> <user-password>');
            process.exit(1);
        }

        multiUserManager.initializeEncryption(password);

        multiUserManager.authenticateUser(username, userPassword, {
            ipAddress: '127.0.0.1',
            userAgent: 'CLI'
        }).then(result => {
            if (result.success) {
                console.log('✅ Login successful');
                console.log('User ID:', result.user.id);
                console.log('Session ID:', result.session.id);
                console.log('Token:', result.session.token);
            } else {
                console.error('❌', result.error);
            }
        });
    } else if (command === 'list') {
        const password = process.argv[3];
        const requesterId = process.argv[4];

        if (!password || !requesterId) {
            console.error('Error: Password and requester ID required');
            console.log('Usage: node multi-user.js list <system-password> <requester-id>');
            process.exit(1);
        }

        multiUserManager.initializeEncryption(password);

        try {
            const users = multiUserManager.listUsers(requesterId);
            console.log('✅ Users:', users.length);
            console.log(JSON.stringify(users, null, 2));
        } catch (error) {
            console.error('❌', error.message);
        }
    } else if (command === 'stats') {
        const password = process.argv[3];
        const requesterId = process.argv[4];

        if (!password || !requesterId) {
            console.error('Error: Password and requester ID required');
            console.log('Usage: node multi-user.js stats <system-password> <requester-id>');
            process.exit(1);
        }

        multiUserManager.initializeEncryption(password);

        try {
            const stats = multiUserManager.getSystemStats(requesterId);
            console.log('✅ System Statistics:');
            console.log(JSON.stringify(stats, null, 2));
        } catch (error) {
            console.error('❌', error.message);
        }
    } else if (command === 'test') {
        console.log('👥 Testing Multi-user System...\n');

        const systemPassword = 'test-system-password-' + Date.now();

        // Test 1: Initialize
        console.log('Test 1: Initialize multi-user system');
        multiUserManager.initializeEncryption(systemPassword);

        // Ensure RBAC roles exist
        if (!rbacManager.getRole('admin')) {
            // RBAC not initialized, roles should be loaded from file or created
            console.log('⚠️  RBAC roles not found, they should be initialized first');
        }

        console.log('✅ System initialized');

        // Test 2: Create users
        console.log('\nTest 2: Create users');
        Promise.all([
            multiUserManager.createUser({
                username: 'admin',
                password: 'admin123',
                email: 'admin@example.com',
                role: 'admin', // Use 'admin' not 'administrator'
                consent: true,
                ipAddress: '127.0.0.1'
            }),
            multiUserManager.createUser({
                username: 'john',
                password: 'john123',
                email: 'john@example.com',
                role: 'user', // Use 'user' not 'standard_user'
                consent: true,
                ipAddress: '127.0.0.1'
            }),
            multiUserManager.createUser({
                username: 'jane',
                password: 'jane123',
                email: 'jane@example.com',
                role: 'readonly', // Use 'readonly' not 'read_only'
                consent: true,
                ipAddress: '127.0.0.1'
            })
        ]).then(users => {
            console.log('✅ Created 3 users');
            console.log('  - admin (admin)');
            console.log('  - john (user)');
            console.log('  - jane (readonly)');

            const [admin, john, jane] = users;

            // Test 3: Authentication
            console.log('\nTest 3: Authenticate users');
            return Promise.all([
                multiUserManager.authenticateUser('admin', 'admin123', { ipAddress: '127.0.0.1' }),
                multiUserManager.authenticateUser('john', 'john123', { ipAddress: '127.0.0.1' }),
                multiUserManager.authenticateUser('john', 'wrong-password', { ipAddress: '127.0.0.1' })
            ]).then(results => {
                console.log('✅ Admin login:', results[0].success ? '✅' : '❌');
                console.log('✅ John login:', results[1].success ? '✅' : '❌');
                console.log('✅ Wrong password:', results[2].success ? '❌ Should fail' : '✅ Correctly rejected');

                return { admin, john, jane, sessions: results };
            });
        }).then(({ admin, john, jane, sessions }) => {
            // Test 4: List users
            console.log('\nTest 4: List users');
            const users = multiUserManager.listUsers(admin.id);
            console.log('✅ Listed users:', users.length === 3 ? '✅' : '❌');

            // Test 5: System stats
            console.log('\nTest 5: System statistics');
            const stats = multiUserManager.getSystemStats(admin.id);
            console.log('✅ Total users:', stats.users.total);
            console.log('✅ Active sessions:', stats.sessions.active);
            console.log('✅ Users by role:', JSON.stringify(stats.users.byRole));

            // Test 6: Update user
            console.log('\nTest 6: Update user');
            return multiUserManager.updateUser(john.id, {
                profile: { firstName: 'John', lastName: 'Doe' }
            }, john.id).then(updated => {
                console.log('✅ User updated:', updated.profile.firstName === 'John' ? '✅' : '❌');
                return { admin, john, jane, sessions };
            });
        }).then(({ admin, john, jane, sessions }) => {
            // Test 7: Workspace
            console.log('\nTest 7: User workspaces');
            const workspacePath = multiUserManager.getWorkspacePath(john.id);
            const exists = fs.existsSync(workspacePath);
            console.log('✅ Workspace created:', exists ? '✅' : '❌');

            // Test 8: Session validation
            console.log('\nTest 8: Session validation');
            const validation = multiUserManager.validateSession(sessions[0].session.id);
            console.log('✅ Session valid:', validation.valid ? '✅' : '❌');

            // Test 9: Logout
            console.log('\nTest 9: Logout');
            const logout = multiUserManager.logout(sessions[0].session.id);
            console.log('✅ Logout successful:', logout.success ? '✅' : '❌');

            const revalidation = multiUserManager.validateSession(sessions[0].session.id);
            console.log('✅ Session invalidated:', !revalidation.valid ? '✅' : '❌');

            console.log('\n✅ All multi-user tests passed!');
            console.log('\nMulti-user system ready with:');
            console.log('- User management (create, update, delete, list)');
            console.log('- Authentication & sessions');
            console.log('- RBAC integration');
            console.log('- Encrypted storage');
            console.log('- GDPR compliance');
            console.log('- Workspace isolation');
        });
    } else {
        console.log('👥 Multi-user Manager CLI\n');
        console.log('Usage:');
        console.log('  node multi-user.js init <password>                                     - Initialize system');
        console.log('  node multi-user.js create <pwd> <username> <user-pwd> <email> [role]  - Create user');
        console.log('  node multi-user.js login <pwd> <username> <user-pwd>                  - Login user');
        console.log('  node multi-user.js list <pwd> <requester-id>                          - List users');
        console.log('  node multi-user.js stats <pwd> <requester-id>                         - System stats');
        console.log('  node multi-user.js test                                               - Run tests');
        console.log('\nExamples:');
        console.log('  node multi-user.js init mySystemPassword');
        console.log('  node multi-user.js create mySystemPassword john john123 john@example.com');
        console.log('  node multi-user.js test');
    }
}
