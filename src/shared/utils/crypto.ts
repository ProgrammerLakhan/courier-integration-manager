import crypto from 'crypto';
import { config } from '@config';

const ALGORITHM = 'aes-256-gcm';

export class CryptoUtils {
  private static getKey(): Buffer {
    const secret = config.db.encryptionKey || 'super-secret-db-encryption-key-fallback';
    return crypto.createHash('sha256').update(secret).digest();
  }

  static encrypt(data: unknown): unknown {
    if (!data) return data;
    try {
      const text = JSON.stringify(data);
      const iv = crypto.randomBytes(12);
      const key = this.getKey();
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag().toString('hex');
      
      return `${iv.toString('hex')}:${tag}:${encrypted}`;
    } catch {
      return data;
    }
  }

  static decrypt(payload: unknown): unknown {
    if (!payload || typeof payload !== 'string') {
      return payload;
    }
    const parts = payload.split(':');
    if (parts.length !== 3) {
      return payload;
    }
    const [ivHex, tagHex, encrypted] = parts;
    try {
      const key = this.getKey();
      const iv = Buffer.from(ivHex, 'hex');
      const tag = Buffer.from(tagHex, 'hex');
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch {
      return payload;
    }
  }
}
