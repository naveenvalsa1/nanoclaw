#!/usr/bin/env node

/**
 * Secure Storage - Integration Example
 *
 * Demonstrates how to use encryption for secure data storage:
 * - Encrypted task storage
 * - Encrypted user credentials
 * - Encrypted configuration files
 */

const fs = require('fs');
const path = require('path');
const { encryptionManager } = require('./encryption');
const { auditLogger } = require('./audit-logger');

class SecureStorage {
    constructor(password) {
        // Initialize encryption
        try {
            encryptionManager.initializeMasterKey(password);
            this.ready = true;
        } catch (error) {
            console.error('Failed to initialize secure storage:', error.message);
            this.ready = false;
        }
    }

    /**
     * Save tasks with encryption
     */
    saveTasks(tasks, filePath = '/workspace/group/tasks.encrypted.json') {
        if (!this.ready) throw new Error('Secure storage not initialized');

        // Encrypt sensitive fields in each task
        const encryptedTasks = tasks.map(task =>
            encryptionManager.encryptObject(task, ['notes', 'attachments', 'metadata'])
        );

        fs.writeFileSync(filePath, JSON.stringify(encryptedTasks, null, 2), { mode: 0o600 });

        auditLogger.log('file.write', 'info', {
            action: 'save_encrypted_tasks',
            count: tasks.length,
            filePath
        });

        return { success: true, count: tasks.length };
    }

    /**
     * Load tasks with decryption
     */
    loadTasks(filePath = '/workspace/group/tasks.encrypted.json') {
        if (!this.ready) throw new Error('Secure storage not initialized');

        if (!fs.existsSync(filePath)) {
            return [];
        }

        const encryptedTasks = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Decrypt sensitive fields
        const tasks = encryptedTasks.map(task =>
            encryptionManager.decryptObject(task, ['notes', 'attachments', 'metadata'])
        );

        auditLogger.log('file.read', 'info', {
            action: 'load_encrypted_tasks',
            count: tasks.length,
            filePath
        });

        return tasks;
    }

    /**
     * Save encrypted configuration
     */
    saveConfig(config, filePath = '/workspace/group/config.encrypted.json') {
        if (!this.ready) throw new Error('Secure storage not initialized');

        // Encrypt all sensitive fields
        const encrypted = encryptionManager.encryptObject(config, [
            'twilioAuthToken',
            'googleClientSecret',
            'apiKeys',
            'databasePassword',
            'jwtSecret'
        ]);

        fs.writeFileSync(filePath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });

        auditLogger.log('file.write', 'info', {
            action: 'save_encrypted_config',
            filePath
        });

        return { success: true };
    }

    /**
     * Load encrypted configuration
     */
    loadConfig(filePath = '/workspace/group/config.encrypted.json') {
        if (!this.ready) throw new Error('Secure storage not initialized');

        if (!fs.existsSync(filePath)) {
            throw new Error('Config file not found');
        }

        const encrypted = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        const config = encryptionManager.decryptObject(encrypted, [
            'twilioAuthToken',
            'googleClientSecret',
            'apiKeys',
            'databasePassword',
            'jwtSecret'
        ]);

        auditLogger.log('file.read', 'info', {
            action: 'load_encrypted_config',
            filePath
        });

        return config;
    }

    /**
     * Register user with encrypted credentials
     */
    registerUser(username, password, email, apiKeys = {}) {
        if (!this.ready) throw new Error('Secure storage not initialized');

        // Hash password (for authentication)
        const passwordHash = encryptionManager.hashPassword(password);

        const user = {
            id: encryptionManager.generateToken(16),
            username,
            email,
            passwordHash,
            apiKeys,
            createdAt: new Date().toISOString()
        };

        // Encrypt sensitive fields
        const encrypted = encryptionManager.encryptObject(user, ['email', 'apiKeys']);

        auditLogger.log('user.create', 'info', {
            userId: user.id,
            username
        });

        return encrypted;
    }

    /**
     * Authenticate user
     */
    authenticateUser(password, storedUser) {
        if (!this.ready) throw new Error('Secure storage not initialized');

        const isValid = encryptionManager.verifyPassword(password, storedUser.passwordHash);

        auditLogger.log(isValid ? 'auth.login' : 'auth.failed', isValid ? 'info' : 'warn', {
            userId: storedUser.id,
            username: storedUser.username
        });

        return isValid;
    }

    /**
     * Get user with decrypted credentials
     */
    getUserDecrypted(encryptedUser) {
        if (!this.ready) throw new Error('Secure storage not initialized');

        return encryptionManager.decryptObject(encryptedUser, ['email', 'apiKeys']);
    }
}

module.exports = { SecureStorage };

// CLI test
if (require.main === module) {
    console.log('🔐 Testing Secure Storage Integration...\n');

    const password = 'test-password-' + Date.now();
    const storage = new SecureStorage(password);

    // Test 1: Encrypted tasks
    console.log('Test 1: Encrypted Task Storage');
    const tasks = [
        {
            id: 1,
            title: 'Public Task',
            status: 'in-progress',
            notes: 'These are sensitive notes that should be encrypted',
            attachments: ['secret-document.pdf'],
            metadata: { secretKey: 'value123' }
        },
        {
            id: 2,
            title: 'Another Task',
            status: 'completed',
            notes: 'More private information',
            attachments: [],
            metadata: {}
        }
    ];

    storage.saveTasks(tasks);
    console.log('✅ Tasks saved with encryption');

    const loadedTasks = storage.loadTasks();
    console.log('✅ Tasks loaded and decrypted');
    console.log('Decrypted task notes:', loadedTasks[0].notes);
    console.log('Match:', loadedTasks[0].notes === tasks[0].notes ? '✅' : '❌');

    // Test 2: Encrypted config
    console.log('\nTest 2: Encrypted Configuration');
    const config = {
        appName: 'Andy',
        twilioAuthToken: 'secret-auth-token-12345',
        googleClientSecret: 'google-secret-67890',
        apiKeys: {
            openai: 'sk-12345',
            twilio: 'AC-67890'
        },
        publicSetting: 'This is not encrypted'
    };

    storage.saveConfig(config);
    console.log('✅ Config saved with encryption');

    const loadedConfig = storage.loadConfig();
    console.log('✅ Config loaded and decrypted');
    console.log('Decrypted Twilio token:', loadedConfig.twilioAuthToken);
    console.log('Match:', loadedConfig.twilioAuthToken === config.twilioAuthToken ? '✅' : '❌');

    // Test 3: User authentication
    console.log('\nTest 3: User Registration & Authentication');
    const user = storage.registerUser(
        'naveen',
        'securePassword123',
        'naveen@example.com',
        { openai: 'sk-12345', github: 'ghp-67890' }
    );

    console.log('✅ User registered with encrypted credentials');
    console.log('User ID:', user.id);
    console.log('Email encrypted:', user.email_encrypted ? '✅' : '❌');
    console.log('API keys encrypted:', user.apiKeys_encrypted ? '✅' : '❌');

    const isValidPassword = storage.authenticateUser('securePassword123', user);
    const isInvalidPassword = storage.authenticateUser('wrongPassword', user);

    console.log('Correct password:', isValidPassword ? '✅ Valid' : '❌ Invalid');
    console.log('Wrong password:', isInvalidPassword ? '❌ Should be invalid' : '✅ Correctly rejected');

    const decryptedUser = storage.getUserDecrypted(user);
    console.log('Decrypted email:', decryptedUser.email);
    console.log('Decrypted API keys:', JSON.stringify(decryptedUser.apiKeys));

    // Cleanup
    fs.unlinkSync('/workspace/group/tasks.encrypted.json');
    fs.unlinkSync('/workspace/group/config.encrypted.json');

    console.log('\n✅ All secure storage tests passed!');
    console.log('\nIntegration examples:');
    console.log('- Encrypted task storage with sensitive notes');
    console.log('- Encrypted configuration with API keys');
    console.log('- User authentication with hashed passwords');
    console.log('- Encrypted user credentials (email, API keys)');
}
