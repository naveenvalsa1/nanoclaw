#!/usr/bin/env node

/**
 * Role-Based Access Control (RBAC) System
 *
 * Provides granular permission control for:
 * - User management
 * - Role definitions
 * - Permission checks
 * - Resource-level access control
 * - Integration with audit logging
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Storage paths
const RBAC_DIR = path.join(__dirname, 'rbac-data');
const USERS_FILE = path.join(RBAC_DIR, 'users.json');
const ROLES_FILE = path.join(RBAC_DIR, 'roles.json');
const PERMISSIONS_FILE = path.join(RBAC_DIR, 'permissions.json');

// Ensure RBAC directory exists
if (!fs.existsSync(RBAC_DIR)) {
    fs.mkdirSync(RBAC_DIR, { recursive: true });
}

/**
 * Permission definitions
 */
const Permissions = {
    // System
    SYSTEM_ADMIN: 'system.admin',
    SYSTEM_CONFIG: 'system.config',

    // Messages
    MESSAGE_READ: 'message.read',
    MESSAGE_SEND: 'message.send',
    MESSAGE_DELETE: 'message.delete',

    // Files
    FILE_READ: 'file.read',
    FILE_WRITE: 'file.write',
    FILE_EDIT: 'file.edit',
    FILE_DELETE: 'file.delete',

    // Tasks
    TASK_READ: 'task.read',
    TASK_CREATE: 'task.create',
    TASK_UPDATE: 'task.update',
    TASK_DELETE: 'task.delete',
    TASK_ASSIGN: 'task.assign',

    // Calendar
    CALENDAR_READ: 'calendar.read',
    CALENDAR_WRITE: 'calendar.write',

    // Email
    EMAIL_READ: 'email.read',
    EMAIL_SEND: 'email.send',

    // Phone
    PHONE_CALL: 'phone.call',
    PHONE_VIEW_LOGS: 'phone.view_logs',

    // API
    API_READ: 'api.read',
    API_WRITE: 'api.write',

    // Audit
    AUDIT_READ: 'audit.read',
    AUDIT_EXPORT: 'audit.export',

    // Users
    USER_READ: 'user.read',
    USER_CREATE: 'user.create',
    USER_UPDATE: 'user.update',
    USER_DELETE: 'user.delete',

    // Roles
    ROLE_READ: 'role.read',
    ROLE_CREATE: 'role.create',
    ROLE_UPDATE: 'role.update',
    ROLE_DELETE: 'role.delete'
};

/**
 * Predefined roles
 */
const DefaultRoles = {
    SUPER_ADMIN: {
        id: 'super_admin',
        name: 'Super Admin',
        description: 'Full system access with all permissions',
        permissions: Object.values(Permissions),
        isSystem: true
    },
    ADMIN: {
        id: 'admin',
        name: 'Administrator',
        description: 'Administrative access to most features',
        permissions: [
            Permissions.MESSAGE_READ,
            Permissions.MESSAGE_SEND,
            Permissions.FILE_READ,
            Permissions.FILE_WRITE,
            Permissions.FILE_EDIT,
            Permissions.TASK_READ,
            Permissions.TASK_CREATE,
            Permissions.TASK_UPDATE,
            Permissions.TASK_DELETE,
            Permissions.TASK_ASSIGN,
            Permissions.CALENDAR_READ,
            Permissions.CALENDAR_WRITE,
            Permissions.EMAIL_READ,
            Permissions.EMAIL_SEND,
            Permissions.PHONE_CALL,
            Permissions.PHONE_VIEW_LOGS,
            Permissions.API_READ,
            Permissions.API_WRITE,
            Permissions.AUDIT_READ,
            Permissions.USER_READ,
            Permissions.USER_CREATE,
            Permissions.USER_UPDATE,
            Permissions.ROLE_READ
        ],
        isSystem: true
    },
    USER: {
        id: 'user',
        name: 'Standard User',
        description: 'Standard user with basic permissions',
        permissions: [
            Permissions.MESSAGE_READ,
            Permissions.MESSAGE_SEND,
            Permissions.FILE_READ,
            Permissions.FILE_WRITE,
            Permissions.TASK_READ,
            Permissions.TASK_CREATE,
            Permissions.TASK_UPDATE,
            Permissions.CALENDAR_READ,
            Permissions.EMAIL_READ,
            Permissions.USER_READ
        ],
        isSystem: true
    },
    READONLY: {
        id: 'readonly',
        name: 'Read Only',
        description: 'Read-only access to most features',
        permissions: [
            Permissions.MESSAGE_READ,
            Permissions.FILE_READ,
            Permissions.TASK_READ,
            Permissions.CALENDAR_READ,
            Permissions.EMAIL_READ,
            Permissions.USER_READ
        ],
        isSystem: true
    }
};

/**
 * RBAC Manager Class
 */
class RBACManager {
    constructor() {
        this.users = this.loadUsers();
        this.roles = this.loadRoles();
        this.permissions = this.loadPermissions();
    }

    /**
     * Load users from file
     */
    loadUsers() {
        if (!fs.existsSync(USERS_FILE)) {
            const defaultUsers = [
                {
                    id: 'user_1',
                    username: 'naveen',
                    email: 'naveenvalsa@gmail.com',
                    role: 'super_admin',
                    active: true,
                    createdAt: new Date().toISOString()
                }
            ];
            this.saveUsers(defaultUsers);
            return defaultUsers;
        }
        return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    }

    /**
     * Load roles from file
     */
    loadRoles() {
        if (!fs.existsSync(ROLES_FILE)) {
            const roles = Object.values(DefaultRoles);
            this.saveRoles(roles);
            return roles;
        }
        return JSON.parse(fs.readFileSync(ROLES_FILE, 'utf8'));
    }

    /**
     * Load permissions from file
     */
    loadPermissions() {
        if (!fs.existsSync(PERMISSIONS_FILE)) {
            const permissions = Object.entries(Permissions).map(([key, value]) => ({
                id: value,
                name: key,
                description: `Permission for ${value.split('.').join(' ')}`
            }));
            this.savePermissions(permissions);
            return permissions;
        }
        return JSON.parse(fs.readFileSync(PERMISSIONS_FILE, 'utf8'));
    }

    /**
     * Save users to file
     */
    saveUsers(users = this.users) {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        this.users = users;
    }

    /**
     * Save roles to file
     */
    saveRoles(roles = this.roles) {
        fs.writeFileSync(ROLES_FILE, JSON.stringify(roles, null, 2));
        this.roles = roles;
    }

    /**
     * Save permissions to file
     */
    savePermissions(permissions = this.permissions) {
        fs.writeFileSync(PERMISSIONS_FILE, JSON.stringify(permissions, null, 2));
        this.permissions = permissions;
    }

    // ===== User Management =====

    /**
     * Create a new user
     */
    createUser(userId, username, roleId, metadata = {}) {
        // Check if user exists
        if (this.users.find(u => u.id === userId)) {
            throw new Error('User with this ID already exists');
        }

        if (this.users.find(u => u.username === username)) {
            throw new Error('User with this username already exists');
        }

        // Verify role exists
        if (!this.roles.find(r => r.id === roleId)) {
            throw new Error('Role does not exist');
        }

        const user = {
            id: userId,
            username,
            role: roleId,
            active: true,
            metadata,
            createdAt: new Date().toISOString()
        };

        this.users.push(user);
        this.saveUsers();
        return user;
    }

    /**
     * Get user by ID
     */
    getUser(userId) {
        return this.users.find(u => u.id === userId);
    }

    /**
     * Get user by username
     */
    getUserByUsername(username) {
        return this.users.find(u => u.username === username);
    }

    /**
     * Get user by email
     */
    getUserByEmail(email) {
        return this.users.find(u => u.email === email);
    }

    /**
     * Update user
     */
    updateUser(userId, updates) {
        const user = this.getUser(userId);
        if (!user) throw new Error('User not found');

        // Prevent changing system users
        if (user.isSystem) {
            throw new Error('Cannot modify system user');
        }

        // If changing role, verify it exists
        if (updates.role && !this.roles.find(r => r.id === updates.role)) {
            throw new Error('Role does not exist');
        }

        Object.assign(user, updates, { updatedAt: new Date().toISOString() });
        this.saveUsers();
        return user;
    }

    /**
     * Delete user
     */
    deleteUser(userId) {
        const user = this.getUser(userId);
        if (!user) throw new Error('User not found');

        if (user.isSystem) {
            throw new Error('Cannot delete system user');
        }

        this.users = this.users.filter(u => u.id !== userId);
        this.saveUsers();
        return true;
    }

    /**
     * List all users
     */
    listUsers(filter = {}) {
        let filtered = this.users;

        if (filter.active !== undefined) {
            filtered = filtered.filter(u => u.active === filter.active);
        }

        if (filter.role) {
            filtered = filtered.filter(u => u.role === filter.role);
        }

        return filtered;
    }

    // ===== Role Management =====

    /**
     * Create a new role
     */
    createRole(id, name, description, permissions = []) {
        // Check if role exists
        if (this.roles.find(r => r.id === id)) {
            throw new Error('Role already exists');
        }

        // Verify all permissions exist
        const validPermissions = permissions.filter(p =>
            this.permissions.find(perm => perm.id === p)
        );

        const role = {
            id,
            name,
            description,
            permissions: validPermissions,
            isSystem: false,
            createdAt: new Date().toISOString()
        };

        this.roles.push(role);
        this.saveRoles();
        return role;
    }

    /**
     * Get role by ID
     */
    getRole(roleId) {
        return this.roles.find(r => r.id === roleId);
    }

    /**
     * Update role
     */
    updateRole(roleId, updates) {
        const role = this.getRole(roleId);
        if (!role) throw new Error('Role not found');

        if (role.isSystem) {
            throw new Error('Cannot modify system role');
        }

        // If updating permissions, verify they exist
        if (updates.permissions) {
            updates.permissions = updates.permissions.filter(p =>
                this.permissions.find(perm => perm.id === p)
            );
        }

        Object.assign(role, updates, { updatedAt: new Date().toISOString() });
        this.saveRoles();
        return role;
    }

    /**
     * Delete role
     */
    deleteRole(roleId) {
        const role = this.getRole(roleId);
        if (!role) throw new Error('Role not found');

        if (role.isSystem) {
            throw new Error('Cannot delete system role');
        }

        // Check if any users have this role
        const usersWithRole = this.users.filter(u => u.role === roleId);
        if (usersWithRole.length > 0) {
            throw new Error(`Cannot delete role: ${usersWithRole.length} user(s) assigned to it`);
        }

        this.roles = this.roles.filter(r => r.id !== roleId);
        this.saveRoles();
        return true;
    }

    /**
     * List all roles
     */
    listRoles(includeSystem = true) {
        if (includeSystem) return this.roles;
        return this.roles.filter(r => !r.isSystem);
    }

    // ===== Permission Checks =====

    /**
     * Check if user has permission
     */
    hasPermission(userId, permission) {
        const user = this.getUser(userId);
        if (!user || !user.active) return false;

        const role = this.getRole(user.role);
        if (!role) return false;

        return role.permissions.includes(permission);
    }

    /**
     * Check if user has any of the permissions
     */
    hasAnyPermission(userId, permissions) {
        return permissions.some(permission => this.hasPermission(userId, permission));
    }

    /**
     * Check if user has all permissions
     */
    hasAllPermissions(userId, permissions) {
        return permissions.every(permission => this.hasPermission(userId, permission));
    }

    /**
     * Get user's permissions
     */
    getUserPermissions(userId) {
        const user = this.getUser(userId);
        if (!user) return [];

        const role = this.getRole(user.role);
        return role ? role.permissions : [];
    }

    /**
     * Check access with audit logging
     */
    checkAccess(userId, permission, resource = null) {
        const hasAccess = this.hasPermission(userId, permission);
        const user = this.getUser(userId);

        // Log access attempt (integrate with audit logger if available)
        try {
            const { auditLogger } = require('./audit-logger');
            if (hasAccess) {
                auditLogger.log(
                    'access.granted',
                    'info',
                    {
                        userId,
                        username: user?.username,
                        permission,
                        resource
                    }
                );
            } else {
                auditLogger.log(
                    'access.denied',
                    'warn',
                    {
                        userId,
                        username: user?.username,
                        permission,
                        resource
                    }
                );
            }
        } catch (e) {
            // Audit logger not available
        }

        return hasAccess;
    }

    // ===== Statistics =====

    /**
     * Get RBAC statistics
     */
    getStatistics() {
        const activeUsers = this.users.filter(u => u.active).length;
        const roleDistribution = {};

        this.users.forEach(user => {
            roleDistribution[user.role] = (roleDistribution[user.role] || 0) + 1;
        });

        return {
            totalUsers: this.users.length,
            activeUsers,
            inactiveUsers: this.users.length - activeUsers,
            totalRoles: this.roles.length,
            systemRoles: this.roles.filter(r => r.isSystem).length,
            customRoles: this.roles.filter(r => !r.isSystem).length,
            totalPermissions: this.permissions.length,
            roleDistribution
        };
    }
}

// Export singleton instance
const rbacManager = new RBACManager();

module.exports = {
    rbacManager,
    RBACManager,
    Permissions,
    DefaultRoles
};

// CLI interface
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'stats') {
        const stats = rbacManager.getStatistics();
        console.log('RBAC Statistics:');
        console.log(JSON.stringify(stats, null, 2));
    } else if (command === 'list-users') {
        const users = rbacManager.listUsers();
        console.log('Users:');
        users.forEach(u => {
            console.log(`  ${u.username} (${u.email}) - Role: ${u.role} - Active: ${u.active}`);
        });
    } else if (command === 'list-roles') {
        const roles = rbacManager.listRoles();
        console.log('Roles:');
        roles.forEach(r => {
            console.log(`  ${r.name} (${r.id}) - ${r.permissions.length} permissions${r.isSystem ? ' [SYSTEM]' : ''}`);
        });
    } else if (command === 'check') {
        const userId = process.argv[3];
        const permission = process.argv[4];

        if (!userId || !permission) {
            console.error('Usage: node rbac.js check <userId> <permission>');
            process.exit(1);
        }

        const hasPermission = rbacManager.hasPermission(userId, permission);
        const user = rbacManager.getUser(userId);

        if (hasPermission) {
            console.log(`✅ User '${user?.username}' HAS permission: ${permission}`);
        } else {
            console.log(`❌ User '${user?.username}' DOES NOT have permission: ${permission}`);
        }
    } else if (command === 'test') {
        console.log('Running RBAC test...\n');

        // Test default users
        console.log('Default Users:');
        rbacManager.listUsers().forEach(u => {
            console.log(`  ${u.username} - ${u.role}`);
        });

        // Test permission checks
        const user = rbacManager.getUserByUsername('naveen');
        if (user) {
            console.log(`\nPermissions for ${user.username}:`);
            console.log(`  Can read messages: ${rbacManager.hasPermission(user.id, Permissions.MESSAGE_READ)}`);
            console.log(`  Can send messages: ${rbacManager.hasPermission(user.id, Permissions.MESSAGE_SEND)}`);
            console.log(`  Can delete files: ${rbacManager.hasPermission(user.id, Permissions.FILE_DELETE)}`);
            console.log(`  Can make phone calls: ${rbacManager.hasPermission(user.id, Permissions.PHONE_CALL)}`);
            console.log(`  Total permissions: ${rbacManager.getUserPermissions(user.id).length}`);
        }

        // Test creating a custom role
        console.log('\nCreating custom role...');
        try {
            const customRole = rbacManager.createRole(
                'developer',
                'Developer',
                'Developer with code access',
                [
                    Permissions.MESSAGE_READ,
                    Permissions.MESSAGE_SEND,
                    Permissions.FILE_READ,
                    Permissions.FILE_WRITE,
                    Permissions.FILE_EDIT,
                    Permissions.TASK_READ,
                    Permissions.TASK_CREATE,
                    Permissions.TASK_UPDATE,
                    Permissions.API_READ
                ]
            );
            console.log(`  Created: ${customRole.name} with ${customRole.permissions.length} permissions`);
        } catch (e) {
            console.log(`  ${e.message}`);
        }

        // Test creating a new user
        console.log('\nCreating test user...');
        try {
            const newUser = rbacManager.createUser('testuser', 'test@example.com', 'user');
            console.log(`  Created: ${newUser.username} (${newUser.email}) with role: ${newUser.role}`);
        } catch (e) {
            console.log(`  ${e.message}`);
        }

        console.log('\nStatistics:');
        console.log(JSON.stringify(rbacManager.getStatistics(), null, 2));
    } else {
        console.log('RBAC Manager CLI');
        console.log('\nUsage:');
        console.log('  node rbac.js test                           - Run comprehensive test');
        console.log('  node rbac.js stats                          - Show statistics');
        console.log('  node rbac.js list-users                     - List all users');
        console.log('  node rbac.js list-roles                     - List all roles');
        console.log('  node rbac.js check <userId> <permission>    - Check user permission');
        console.log('\nExample:');
        console.log('  node rbac.js test');
        console.log('  node rbac.js check user_1 message.send');
    }
}
