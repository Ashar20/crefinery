import * as crypto from 'crypto';
import { SessionData, EncryptedSession, EncryptedModelData } from '../types';

export class EncryptionService {
    isFullyConfigured(): boolean {
        return true;
    }

    isConfigured(): boolean {
        return true;
    }

    // --- Session encryption ---

    encryptSession(sessionData: SessionData): EncryptedSession {
        const plaintext = JSON.stringify(sessionData);
        const plaintextBuffer = Buffer.from(plaintext, 'utf-8');

        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);

        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([
            cipher.update(plaintextBuffer),
            cipher.final()
        ]);
        const authTag = cipher.getAuthTag();

        const nonce = crypto.randomBytes(16).toString('hex');

        return {
            encryptedData: encrypted.toString('base64'),
            encryptionKey: key.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            cid: '',
            nonce,
            sessionId: sessionData.sessionId
        };
    }

    decryptSession(encryptedSession: EncryptedSession): SessionData {
        const encryptedData = Buffer.from(encryptedSession.encryptedData, 'base64');
        const key = Buffer.from(encryptedSession.encryptionKey, 'base64');
        const iv = Buffer.from(encryptedSession.iv, 'base64');
        const authTag = Buffer.from(encryptedSession.authTag, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(encryptedData),
            decipher.final()
        ]);

        return JSON.parse(decrypted.toString('utf-8')) as SessionData;
    }

    // --- Model encryption ---

    encryptModel(content: string, modelId: string): EncryptedModelData {
        const plaintextBuffer = Buffer.from(content, 'utf-8');

        const key = crypto.randomBytes(32);
        const iv = crypto.randomBytes(12);

        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        const encrypted = Buffer.concat([
            cipher.update(plaintextBuffer),
            cipher.final()
        ]);
        const authTag = cipher.getAuthTag();

        const nonce = crypto.randomBytes(16).toString('hex');

        return {
            encryptedData: encrypted.toString('base64'),
            encryptionKey: key.toString('base64'),
            iv: iv.toString('base64'),
            authTag: authTag.toString('base64'),
            cid: '',
            nonce,
            modelId
        };
    }

    decryptModel(encryptedData: EncryptedModelData): string {
        const data = Buffer.from(encryptedData.encryptedData, 'base64');
        const key = Buffer.from(encryptedData.encryptionKey, 'base64');
        const iv = Buffer.from(encryptedData.iv, 'base64');
        const authTag = Buffer.from(encryptedData.authTag, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(authTag);

        const decrypted = Buffer.concat([
            decipher.update(data),
            decipher.final()
        ]);

        return decrypted.toString('utf-8');
    }

    decrypt(encryptedData: string, encryptionKey: string, iv: string, authTag: string): string {
        const data = Buffer.from(encryptedData, 'base64');
        const key = Buffer.from(encryptionKey, 'base64');
        const ivBuf = Buffer.from(iv, 'base64');
        const tag = Buffer.from(authTag, 'base64');

        const decipher = crypto.createDecipheriv('aes-256-gcm', key, ivBuf);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
            decipher.update(data),
            decipher.final()
        ]);

        return decrypted.toString('utf-8');
    }
}
