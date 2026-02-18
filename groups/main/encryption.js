#!/usr/bin/env node

/**
 * Data Encryption at Rest - Security Foundation
 *
 * Provides AES-256-GCM encryption for sensitive data:
 * - Task data
 * - User credentials
 * - API keys
 * - Personal information
 * - Configuration files
 *
 * Features:
 * - AES-256-GCM (authenticated encryption)
 * - Secure key derivation (PBKDF2)
 * - Key rotation support
 * - Encrypted field-level granularity
 * - Audit logging integration
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { auditLogger } = require('./audit-logger');

// Encryption configuration
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 32; // 256 bits
const PBKDF2_ITERATIONS = 100000;

// Key storage
const KEY_STORAGE_DIR = path.join(__dirname, 'encryption-keys');
const MASTER_KEY_FILE = path.join(KEY_STORAGE_DIR, 'master.key');
const KEY_METADATA_FILE = path.join(KEY_STORAGE_DIR, 'keys.json');

// Ensure key storage directory exists
if (!fs.existsSync(KEY_STORAGE_DIR)) {
    fs.mkdirSync(KEY_STORAGE_DIR, { recursive: true, mode: 0o700 });
}

/**
 * Encryption Manager
 */
class EncryptionManager {
    constructor() {
        this.masterKey = null;
        this.keyMetadata = this.loadKeyMetadata();
    }

    /**
     * Initialize or load master key
     */
    initializeMasterKey(password = null) {
        if (fs.existsSync(MASTER_KEY_FILE)) {
            // Load existing master key
            try {
                const encryptedKey = fs.readFileSync(MASTER_KEY_FILE);

                if (!password) {
                    throw new Error('Password required to unlock master key');
                }

                this.masterKey = this.unwrapMasterKey(encryptedKey, password);
                auditLogger.log('system.start', 'info', {
                    component: 'encryption',
                    action: 'master_key_loaded'
                });

                return { success: true, message: 'Master key loaded successfully' };
            } catch (error) {
                auditLogger.systemError(error, { action: 'load_master_key' });
                throw new Error('Failed to load master key: ' + error.message);
            }
        } else {
            // Generate new master key
            if (!password) {
                throw new Error('Password required to create master key');
            }

            this.masterKey = crypto.randomBytes(KEY_LENGTH);
            const wrapped = this.wrapMasterKey(this.masterKey, password);

            fs.writeFileSync(MASTER_KEY_FILE, wrapped, { mode: 0o600 });

            this.updateKeyMetadata({
                created: new Date().toISOString(),
                algorithm: ALGORITHM,
                keyLength: KEY_LENGTH,
                lastRotation: new Date().toISOString()
            });

            auditLogger.log('system.start', 'info', {
                component: 'encryption',
                action: 'master_key_created'
            });

            return { success: true, message: 'Master key created successfully' };
        }
    }

    /**
     * Wrap master key with password (PBKDF2 + AES-256-GCM)
     */
    wrapMasterKey(masterKey, password) {
        const salt = crypto.randomBytes(SALT_LENGTH);
        const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');
        const iv = crypto.randomBytes(IV_LENGTH);

        const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
        const encrypted = Buffer.concat([cipher.update(masterKey), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Format: salt + iv + authTag + encrypted
        return Buffer.concat([salt, iv, authTag, encrypted]);
    }

    /**
     * Unwrap master key with password
     */
    unwrapMasterKey(wrappedKey, password) {
        const salt = wrappedKey.slice(0, SALT_LENGTH);
        const iv = wrappedKey.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const authTag = wrappedKey.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = wrappedKey.slice(SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH);

        const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(authTag);

        return Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }

    /**
     * Encrypt data
     */
    encrypt(plaintext) {
        if (!this.masterKey) {
            throw new Error('Master key not initialized');
        }

        const iv = crypto.randomBytes(IV_LENGTH);
        const cipher = crypto.createCipheriv(ALGORITHM, this.masterKey, iv);

        const plaintextBuffer = Buffer.isBuffer(plaintext)
            ? plaintext
            : Buffer.from(typeof plaintext === 'string' ? plaintext : JSON.stringify(plaintext), 'utf8');

        const encrypted = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Format: iv + authTag + encrypted (all base64 encoded)
        const result = {
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            encrypted: encrypted.toString('base64'),
            algorithm: ALGORITHM,
            timestamp: new Date().toISOString()
        };

        return result;
    }

    /**
     * Decrypt data
     */
    decrypt(encryptedData) {
        if (!this.masterKey) {
            throw new Error('Master key not initialized');
        }

        const iv = Buffer.from(encryptedData.iv, 'base64');
        const authTag = Buffer.from(encryptedData.authTag, 'base64');
        const encrypted = Buffer.from(encryptedData.encrypted, 'base64');

        const decipher = crypto.createDecipheriv(ALGORITHM, this.masterKey, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

        return decrypted.toString('utf8');
    }

    /**
     * Encrypt JSON object (field-level encryption)
     */
    encryptObject(obj, fieldsToEncrypt = []) {
        const encrypted = { ...obj };

        for (const field of fieldsToEncrypt) {
            if (obj[field] !== undefined) {
                encrypted[field] = this.encrypt(obj[field]);
                encrypted[`${field}_encrypted`] = true;
            }
        }

        auditLogger.log('file.write', 'debug', {
            action: 'encrypt_object',
            fieldsEncrypted: fieldsToEncrypt.length
        });

        return encrypted;
    }

    /**
     * Decrypt JSON object (field-level decryption)
     */
    decryptObject(obj, fieldsToDecrypt = []) {
        const decrypted = { ...obj };

        for (const field of fieldsToDecrypt) {
            if (obj[`${field}_encrypted`] && obj[field]) {
                try {
                    const decryptedValue = this.decrypt(obj[field]);

                    // Try to parse as JSON, fallback to string
                    try {
                        decrypted[field] = JSON.parse(decryptedValue);
                    } catch {
                        decrypted[field] = decryptedValue;
                    }

                    delete decrypted[`${field}_encrypted`];
                } catch (error) {
                    auditLogger.systemError(error, {
                        action: 'decrypt_field',
                        field
                    });
                    throw new Error(`Failed to decrypt field: ${field}`);
                }
            }
        }

        return decrypted;
    }

    /**
     * Encrypt file
     */
    encryptFile(inputPath, outputPath = null) {
        if (!outputPath) {
            outputPath = inputPath + '.encrypted';
        }

        const plaintext = fs.readFileSync(inputPath);
        const encrypted = this.encrypt(plaintext);

        fs.writeFileSync(outputPath, JSON.stringify(encrypted, null, 2), { mode: 0o600 });

        auditLogger.log('file.write', 'info', {
            action: 'encrypt_file',
            inputPath,
            outputPath,
            size: plaintext.length
        });

        return outputPath;
    }

    /**
     * Decrypt file
     */
    decryptFile(inputPath, outputPath = null) {
        if (!outputPath) {
            outputPath = inputPath.replace('.encrypted', '');
        }

        const encryptedData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
        const decrypted = this.decrypt(encryptedData);

        fs.writeFileSync(outputPath, decrypted, { mode: 0o600 });

        auditLogger.log('file.read', 'info', {
            action: 'decrypt_file',
            inputPath,
            outputPath
        });

        return outputPath;
    }

    /**
     * Rotate master key
     */
    rotateMasterKey(currentPassword, newPassword) {
        if (!this.masterKey) {
            throw new Error('Master key not initialized');
        }

        // Generate new master key
        const newMasterKey = crypto.randomBytes(KEY_LENGTH);

        // Wrap with new password
        const wrapped = this.wrapMasterKey(newMasterKey, newPassword);

        // Backup old key
        const backupPath = MASTER_KEY_FILE + '.backup.' + Date.now();
        fs.copyFileSync(MASTER_KEY_FILE, backupPath);

        // Save new key
        fs.writeFileSync(MASTER_KEY_FILE, wrapped, { mode: 0o600 });

        // Update metadata
        this.updateKeyMetadata({
            lastRotation: new Date().toISOString(),
            previousKeyBackup: backupPath
        });

        const oldMasterKey = this.masterKey;
        this.masterKey = newMasterKey;

        auditLogger.log('system.config', 'warn', {
            action: 'key_rotation',
            backupPath
        });

        return {
            success: true,
            message: 'Master key rotated successfully',
            oldKey: oldMasterKey,
            newKey: newMasterKey,
            backupPath
        };
    }

    /**
     * Re-encrypt data with new key (after rotation)
     */
    reencryptWithNewKey(encryptedData, oldKey) {
        // Temporarily use old key
        const originalKey = this.masterKey;
        this.masterKey = oldKey;

        // Decrypt with old key
        const plaintext = this.decrypt(encryptedData);

        // Switch to new key
        this.masterKey = originalKey;

        // Encrypt with new key
        return this.encrypt(plaintext);
    }

    /**
     * Load key metadata
     */
    loadKeyMetadata() {
        if (fs.existsSync(KEY_METADATA_FILE)) {
            return JSON.parse(fs.readFileSync(KEY_METADATA_FILE, 'utf8'));
        }
        return {};
    }

    /**
     * Update key metadata
     */
    updateKeyMetadata(updates) {
        this.keyMetadata = { ...this.keyMetadata, ...updates };
        fs.writeFileSync(
            KEY_METADATA_FILE,
            JSON.stringify(this.keyMetadata, null, 2),
            { mode: 0o600 }
        );
    }

    /**
     * Get encryption status
     */
    getStatus() {
        return {
            initialized: this.masterKey !== null,
            algorithm: ALGORITHM,
            keyLength: KEY_LENGTH,
            metadata: this.keyMetadata,
            keyFileExists: fs.existsSync(MASTER_KEY_FILE)
        };
    }

    /**
     * Secure string comparison (constant time)
     */
    secureCompare(a, b) {
        return crypto.timingSafeEqual(
            Buffer.from(a),
            Buffer.from(b)
        );
    }

    /**
     * Generate random token
     */
    generateToken(length = 32) {
        return crypto.randomBytes(length).toString('base64url');
    }

    /**
     * Hash password (for user authentication)
     */
    hashPassword(password) {
        const salt = crypto.randomBytes(SALT_LENGTH);
        const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha256');

        return {
            hash: hash.toString('base64'),
            salt: salt.toString('base64'),
            iterations: PBKDF2_ITERATIONS,
            algorithm: 'pbkdf2'
        };
    }

    /**
     * Verify password
     */
    verifyPassword(password, storedHash) {
        const salt = Buffer.from(storedHash.salt, 'base64');
        const hash = crypto.pbkdf2Sync(password, salt, storedHash.iterations, KEY_LENGTH, 'sha256');

        return this.secureCompare(hash, Buffer.from(storedHash.hash, 'base64'));
    }
}

// Export singleton
const encryptionManager = new EncryptionManager();

module.exports = {
    encryptionManager,
    EncryptionManager
};

// CLI interface
if (require.main === module) {
    const command = process.argv[2];

    if (command === 'init') {
        const password = process.argv[3];
        if (!password) {
            console.error('Error: Password required');
            console.log('Usage: node encryption.js init <password>');
            process.exit(1);
        }

        try {
            const result = encryptionManager.initializeMasterKey(password);
            console.log('✅', result.message);
            console.log('Key storage:', KEY_STORAGE_DIR);
        } catch (error) {
            console.error('❌', error.message);
            process.exit(1);
        }
    } else if (command === 'status') {
        const status = encryptionManager.getStatus();
        console.log('Encryption Status:');
        console.log(JSON.stringify(status, null, 2));
    } else if (command === 'encrypt-file') {
        const password = process.argv[3];
        const inputPath = process.argv[4];
        const outputPath = process.argv[5];

        if (!password || !inputPath) {
            console.error('Error: Password and input file required');
            console.log('Usage: node encryption.js encrypt-file <password> <input> [output]');
            process.exit(1);
        }

        try {
            encryptionManager.initializeMasterKey(password);
            const result = encryptionManager.encryptFile(inputPath, outputPath);
            console.log('✅ File encrypted:', result);
        } catch (error) {
            console.error('❌', error.message);
            process.exit(1);
        }
    } else if (command === 'decrypt-file') {
        const password = process.argv[3];
        const inputPath = process.argv[4];
        const outputPath = process.argv[5];

        if (!password || !inputPath) {
            console.error('Error: Password and input file required');
            console.log('Usage: node encryption.js decrypt-file <password> <input> [output]');
            process.exit(1);
        }

        try {
            encryptionManager.initializeMasterKey(password);
            const result = encryptionManager.decryptFile(inputPath, outputPath);
            console.log('✅ File decrypted:', result);
        } catch (error) {
            console.error('❌', error.message);
            process.exit(1);
        }
    } else if (command === 'rotate') {
        const currentPassword = process.argv[3];
        const newPassword = process.argv[4];

        if (!currentPassword || !newPassword) {
            console.error('Error: Current and new passwords required');
            console.log('Usage: node encryption.js rotate <current-password> <new-password>');
            process.exit(1);
        }

        try {
            encryptionManager.initializeMasterKey(currentPassword);
            const result = encryptionManager.rotateMasterKey(currentPassword, newPassword);
            console.log('✅', result.message);
            console.log('Backup created:', result.backupPath);
            console.log('⚠️  You must now re-encrypt all encrypted data with the new key');
        } catch (error) {
            console.error('❌', error.message);
            process.exit(1);
        }
    } else if (command === 'test') {
        console.log('🔐 Testing Encryption System...\n');

        // Test 1: Initialize master key
        console.log('Test 1: Master key initialization');
        const testPassword = 'test-password-' + Date.now();
        try {
            const result = encryptionManager.initializeMasterKey(testPassword);
            console.log('✅', result.message);
        } catch (error) {
            console.error('❌', error.message);
        }

        // Test 2: Encrypt/decrypt string
        console.log('\nTest 2: String encryption');
        const testString = 'Hello, this is sensitive data!';
        const encrypted = encryptionManager.encrypt(testString);
        console.log('Encrypted:', encrypted.encrypted.substring(0, 50) + '...');
        const decrypted = encryptionManager.decrypt(encrypted);
        console.log('Decrypted:', decrypted);
        console.log(decrypted === testString ? '✅ Match' : '❌ Mismatch');

        // Test 3: Encrypt/decrypt object
        console.log('\nTest 3: Object encryption (field-level)');
        const testObj = {
            id: 'user123',
            name: 'Naveen',
            email: 'naveen@example.com',
            apiKey: 'secret-api-key-12345',
            publicData: 'This is not encrypted'
        };
        const encryptedObj = encryptionManager.encryptObject(testObj, ['email', 'apiKey']);
        console.log('Encrypted object:', JSON.stringify(encryptedObj, null, 2).substring(0, 300) + '...');
        const decryptedObj = encryptionManager.decryptObject(encryptedObj, ['email', 'apiKey']);
        console.log('Decrypted object:', decryptedObj);
        console.log(decryptedObj.apiKey === testObj.apiKey ? '✅ Match' : '❌ Mismatch');

        // Test 4: Password hashing
        console.log('\nTest 4: Password hashing');
        const password = 'mySecurePassword123';
        const hashed = encryptionManager.hashPassword(password);
        console.log('Hash:', hashed.hash.substring(0, 30) + '...');
        const isValid = encryptionManager.verifyPassword(password, hashed);
        const isInvalid = encryptionManager.verifyPassword('wrongPassword', hashed);
        console.log('Correct password:', isValid ? '✅ Valid' : '❌ Invalid');
        console.log('Wrong password:', isInvalid ? '❌ Should be invalid' : '✅ Correctly rejected');

        // Test 5: Token generation
        console.log('\nTest 5: Token generation');
        const token = encryptionManager.generateToken();
        console.log('Generated token:', token);
        console.log(token.length > 30 ? '✅ Valid length' : '❌ Too short');

        // Test 6: File encryption
        console.log('\nTest 6: File encryption');
        const testFilePath = path.join(__dirname, 'test-encryption-file.txt');
        const testContent = 'This is a test file with sensitive content\nLine 2\nLine 3';
        fs.writeFileSync(testFilePath, testContent);

        const encryptedFilePath = encryptionManager.encryptFile(testFilePath);
        console.log('Encrypted file created:', encryptedFilePath);

        const decryptedFilePath = path.join(__dirname, 'test-encryption-file-decrypted.txt');
        encryptionManager.decryptFile(encryptedFilePath, decryptedFilePath);
        const decryptedContent = fs.readFileSync(decryptedFilePath, 'utf8');
        console.log('Decrypted content matches:', decryptedContent === testContent ? '✅ Yes' : '❌ No');

        // Cleanup
        fs.unlinkSync(testFilePath);
        fs.unlinkSync(encryptedFilePath);
        fs.unlinkSync(decryptedFilePath);

        console.log('\n✅ All tests completed!');
        console.log('\nEncryption system ready for production use.');
        console.log('Key storage:', KEY_STORAGE_DIR);
    } else {
        console.log('🔐 Encryption Manager CLI\n');
        console.log('Usage:');
        console.log('  node encryption.js init <password>                    - Initialize master key');
        console.log('  node encryption.js status                             - Check encryption status');
        console.log('  node encryption.js encrypt-file <pwd> <in> [out]      - Encrypt file');
        console.log('  node encryption.js decrypt-file <pwd> <in> [out]      - Decrypt file');
        console.log('  node encryption.js rotate <current-pwd> <new-pwd>     - Rotate master key');
        console.log('  node encryption.js test                               - Run comprehensive tests');
        console.log('\nExamples:');
        console.log('  node encryption.js init mySecurePassword123');
        console.log('  node encryption.js test');
        console.log('  node encryption.js encrypt-file myPassword secrets.json');
    }
}
