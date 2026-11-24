/**
 * Cryptographic Vault Service (AES-256-GCM Authenticated Encryption)
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // Standard GCM IV length (96 bits)
const TAG_LENGTH = 16; // Standard GCM tag length (128 bits)

/**
 * Resolves the 32-byte encryption key from environment or deterministic institutional fallback.
 */
export function getEncryptionKey(): Buffer {
  const envKey = process.env.AI_PROVIDER_ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      // Hex string of 32 bytes
      return Buffer.from(envKey, "hex");
    }
    // Hash key to ensure exact 32 bytes
    return crypto.createHash("sha256").update(envKey).digest();
  }
  // Deterministic institutional fallback for non-production environments
  return crypto
    .createHash("sha256")
    .update("kle-tech-aura-institutional-vault-secret-key-2026")
    .digest();
}

/**
 * Encrypts sensitive secret using AES-256-GCM.
 * Output format: `<hex_iv>:<hex_auth_tag>:<hex_ciphertext>`
 */
export function encryptSecret(plaintext: string, keyBuffer?: Buffer): string {
  if (!plaintext || plaintext.trim() === "") {
    throw new Error("CANNOT_ENCRYPT_EMPTY_STRING");
  }
  const key = keyBuffer || getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts sensitive secret using AES-256-GCM with authentication tag verification.
 */
export function decryptSecret(payload: string, keyBuffer?: Buffer): string {
  if (!payload || !payload.includes(":")) {
    throw new Error("INVALID_ENCRYPTED_PAYLOAD_FORMAT");
  }

  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("INVALID_ENCRYPTED_PAYLOAD_STRUCTURE");
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");

  if (iv.length !== IV_LENGTH || tag.length !== TAG_LENGTH) {
    throw new Error("INVALID_IV_OR_TAG_LENGTH");
  }

  const key = keyBuffer || getEncryptionKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  try {
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString("utf8");
  } catch (err: any) {
    throw new Error("DECRYPTION_FAILED: Ciphertext corrupted or authentication tag verification failed");
  }
}

/**
 * Masks sensitive credentials for display (e.g. `••••••••abcd`).
 */
export function maskSecret(secret: string): { masked: string; suffix: string } {
  if (!secret || secret.trim() === "") {
    return { masked: "", suffix: "" };
  }
  const clean = secret.trim();
  const suffix = clean.length <= 4 ? clean : clean.slice(-4);
  const masked = "••••••••" + suffix;
  return { masked, suffix };
}

/**
 * Deeply scrubs secrets from objects/logs before serialization.
 */
export function redactSensitiveObject<T>(input: T): T {
  if (!input || typeof input !== "object") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(redactSensitiveObject) as unknown as T;
  }

  const SENSITIVE_KEYS = [
    "authorization",
    "apikey",
    "api_key",
    "secret",
    "password",
    "token",
    "encrypted_api_key",
    "auth_token",
  ];

  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(input)) {
    const lowerKey = k.toLowerCase().replace(/[-_]/g, "");
    if (SENSITIVE_KEYS.some((sk) => lowerKey.includes(sk.replace(/[-_]/g, "")))) {
      if (typeof v === "string" && v.length > 0) {
        result[k] = "[REDACTED]";
      } else {
        result[k] = v;
      }
    } else if (typeof v === "object" && v !== null) {
      result[k] = redactSensitiveObject(v);
    } else {
      result[k] = v;
    }
  }

  return result as T;
}
