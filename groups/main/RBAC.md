# Role-Based Access Control (RBAC) System

## Overview

The RBAC system provides granular permission control for Andy, enabling multi-user support with fine-grained access control to all system features.

## Features

### ✅ User Management
- Create, read, update, delete users
- User activation/deactivation
- Email and username uniqueness
- Metadata support for custom fields

### ✅ Role Management
- Predefined system roles
- Custom role creation
- Permission assignment
- Role-based access control

### ✅ Permission System
- 32 granular permissions across all features
- Permission checking at resource level
- Audit logging integration
- Fine-grained access control

### ✅ Access Control
- Check single permission
- Check multiple permissions (any/all)
- Get user permissions list
- Audit all access attempts

## Architecture

### Storage
- **Format**: JSON files
- **Location**: `/workspace/group/rbac-data/`
- **Files**:
  - `users.json` - User accounts
  - `roles.json` - Role definitions
  - `permissions.json` - Permission catalog

### Data Structure

**User:**
```json
{
  "id": "user_1",
  "username": "naveen",
  "email": "naveenvalsa@gmail.com",
  "role": "super_admin",
  "active": true,
  "metadata": {},
  "createdAt": "2026-02-09T12:00:00.000Z"
}
```

**Role:**
```json
{
  "id": "admin",
  "name": "Administrator",
  "description": "Administrative access",
  "permissions": ["message.read", "message.send", "..."],
  "isSystem": true,
  "createdAt": "2026-02-09T12:00:00.000Z"
}
```

## Predefined Roles

### 1. Super Admin
- **Permissions**: All 32 permissions
- **Use Case**: System owner, full access
- **Cannot be**: Modified or deleted

### 2. Administrator
- **Permissions**: 23 permissions (excludes system config)
- **Use Case**: Day-to-day admin tasks
- **Can**: Manage users, roles, most operations
- **Cannot**: Modify system configuration

### 3. Standard User
- **Permissions**: 10 basic permissions
- **Use Case**: Regular user
- **Can**: Read/write messages, files, tasks, calendar
- **Cannot**: Delete, admin operations

### 4. Read Only
- **Permissions**: 6 read-only permissions
- **Use Case**: Viewer, auditor
- **Can**: Read messages, files, tasks, calendar
- **Cannot**: Write, modify, delete anything

## Permissions Reference

### System (2)
- `system.admin` - System administration
- `system.config` - System configuration

### Messages (3)
- `message.read` - Read messages
- `message.send` - Send messages
- `message.delete` - Delete messages

### Files (4)
- `file.read` - Read files
- `file.write` - Write files
- `file.edit` - Edit files
- `file.delete` - Delete files

### Tasks (5)
- `task.read` - Read tasks
- `task.create` - Create tasks
- `task.update` - Update tasks
- `task.delete` - Delete tasks
- `task.assign` - Assign tasks

### Calendar (2)
- `calendar.read` - Read calendar
- `calendar.write` - Write calendar

### Email (2)
- `email.read` - Read emails
- `email.send` - Send emails

### Phone (2)
- `phone.call` - Make phone calls
- `phone.view_logs` - View call logs

### API (2)
- `api.read` - Read API
- `api.write` - Write API

### Audit (2)
- `audit.read` - Read audit logs
- `audit.export` - Export audit logs

### Users (4)
- `user.read` - Read users
- `user.create` - Create users
- `user.update` - Update users
- `user.delete` - Delete users

### Roles (4)
- `role.read` - Read roles
- `role.create` - Create roles
- `role.update` - Update roles
- `role.delete` - Delete roles

## Usage

### Basic Usage

```javascript
const { rbacManager, Permissions } = require('./rbac');

// Check permission
const canCall = rbacManager.hasPermission('user_1', Permissions.PHONE_CALL);

// Check access with audit logging
const hasAccess = rbacManager.checkAccess('user_1', Permissions.FILE_DELETE, '/important/file.txt');

// Get user permissions
const permissions = rbacManager.getUserPermissions('user_1');
```

### User Management

```javascript
// Create user
const user = rbacManager.createUser('john', 'john@example.com', 'user', {
    department: 'Engineering',
    location: 'Chennai'
});

// Update user
rbacManager.updateUser('user_1', {
    role: 'admin',
    active: true
});

// Get user
const user = rbacManager.getUserByUsername('john');

// List users
const activeUsers = rbacManager.listUsers({ active: true });

// Delete user
rbacManager.deleteUser('user_2');
```

### Role Management

```javascript
// Create custom role
const role = rbacManager.createRole(
    'developer',
    'Developer',
    'Development team member',
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

// Update role
rbacManager.updateRole('developer', {
    description: 'Updated description',
    permissions: [...existingPermissions, Permissions.API_WRITE]
});

// List roles
const customRoles = rbacManager.listRoles(false); // Exclude system roles

// Delete role
rbacManager.deleteRole('developer');
```

### Permission Checks

```javascript
// Single permission
const canRead = rbacManager.hasPermission('user_1', Permissions.FILE_READ);

// Any permission
const canModify = rbacManager.hasAnyPermission('user_1', [
    Permissions.FILE_EDIT,
    Permissions.FILE_DELETE
]);

// All permissions
const canManageFiles = rbacManager.hasAllPermissions('user_1', [
    Permissions.FILE_READ,
    Permissions.FILE_WRITE,
    Permissions.FILE_EDIT
]);
```

### CLI Commands

```bash
# Run comprehensive test
node rbac.js test

# Show statistics
node rbac.js stats

# List all users
node rbac.js list-users

# List all roles
node rbac.js list-roles

# Check specific permission
node rbac.js check user_1 message.send
```

## Integration with Audit Logger

All access checks can be automatically logged:

```javascript
const hasAccess = rbacManager.checkAccess(
    'user_1',
    Permissions.FILE_DELETE,
    '/important/file.txt'
);
```

This will:
1. Check if user has permission
2. Log access attempt to audit log
3. Include user info, permission, and resource
4. Return true/false

## Middleware Integration

Example Express.js middleware:

```javascript
const { rbacManager, Permissions } = require('./rbac');

function requirePermission(permission) {
    return (req, res, next) => {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const hasAccess = rbacManager.checkAccess(userId, permission, req.path);
        if (!hasAccess) {
            return res.status(403).json({ error: 'Insufficient permissions' });
        }

        next();
    };
}

// Usage
app.delete('/api/files/:id', requirePermission(Permissions.FILE_DELETE), deleteFile);
```

## Best Practices

### 1. Principle of Least Privilege
- Grant minimum required permissions
- Start with restrictive roles
- Add permissions as needed

### 2. Regular Audits
- Review user permissions regularly
- Check for unused accounts
- Verify role assignments

### 3. Custom Roles
- Create role for specific teams/functions
- Document role purpose
- Review permissions periodically

### 4. System Roles
- Never modify system roles
- Use as templates for custom roles
- Understand permission implications

### 5. User Lifecycle
- Deactivate rather than delete users
- Preserve audit trail
- Re-assign tasks before deactivation

## Security Features

✅ **System Protection**
- System roles cannot be modified
- System users cannot be deleted
- Role deletion blocked if users assigned

✅ **Audit Integration**
- All access attempts logged
- Failed access attempts tracked
- User activity monitored

✅ **Data Integrity**
- Username/email uniqueness enforced
- Role existence validated
- Permission validity checked

✅ **Access Control**
- Fine-grained permissions
- Resource-level checks
- Multi-permission validation

## Statistics

Get comprehensive RBAC statistics:

```javascript
const stats = rbacManager.getStatistics();
```

Returns:
- Total/active/inactive users
- Role counts (system/custom)
- Permission count
- User distribution by role

## Testing

```bash
# Run all tests
node rbac.js test

# This will:
# - List default users
# - Check permissions
# - Create custom role
# - Create test user
# - Show statistics
```

## Future Enhancements

- [ ] Group-based permissions
- [ ] Time-based access (temporary permissions)
- [ ] Resource-specific permissions
- [ ] Permission templates
- [ ] Bulk user management
- [ ] LDAP/AD integration
- [ ] SSO support
- [ ] Permission inheritance
- [ ] Advanced audit queries
- [ ] Real-time permission updates

## Compliance

### SOC 2
✅ Access Control
✅ User Management
✅ Audit Trail
✅ Least Privilege

### GDPR
✅ User Data Management
✅ Access Tracking
✅ Right to Delete
✅ Data Minimization

## Support

Files:
- `/workspace/group/rbac.js` - Main module
- `/workspace/group/rbac-data/users.json` - User database
- `/workspace/group/rbac-data/roles.json` - Role definitions
- `/workspace/group/rbac-data/permissions.json` - Permission catalog

For questions or issues, check the RBAC data files or run diagnostic commands.
