/**
 * Safe Exam Browser (SEB) Cryptographic Key Verifier
 * Official Specification: https://safeexambrowser.org/developer/seb-config-key.html
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import crypto from "crypto";

export interface SebVerificationResult {
  verified: boolean;
  keyType?: "CONFIG_KEY" | "BROWSER_EXAM_KEY";
  reason?: string;
}

/**
 * Computes the official SEB SHA-256 hash for a given URL and expected key.
 * Formula: SHA256(requestURL + key)
 */
export function computeSebHash(requestUrl: string, key: string): string {
  if (!requestUrl || !key) {
    throw new Error("URL and key are required to compute SEB hash");
  }
  return crypto.createHash("sha256").update(requestUrl + key).digest("hex");
}

/**
 * Verifies incoming request headers against the expected SEB Config Key or Browser Exam Key.
 * Never trusts a client-side isSEB=true flag.
 */
export function verifySebRequest(
  headers: Record<string, string | string[] | undefined>,
  requestUrl: string,
  expectedKey: string,
  expectedKeyType: "CONFIG_KEY" | "BROWSER_EXAM_KEY" = "CONFIG_KEY"
): SebVerificationResult {
  if (!expectedKey || expectedKey.trim().length === 0) {
    return {
      verified: false,
      reason: "SERVER_CONFIG_ERROR: Expected SEB key not configured on examination schedule",
    };
  }

  // Normalize header keys to lowercase
  const normalizedHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (typeof v === "string") {
      normalizedHeaders[k.toLowerCase()] = v.trim();
    } else if (Array.isArray(v) && v[0]) {
      normalizedHeaders[k.toLowerCase()] = v[0].trim();
    }
  }

  const configKeyHash = normalizedHeaders["x-safeexambrowser-configkeyhash"];
  const requestHash = normalizedHeaders["x-safeexambrowser-requesthash"];

  const providedHash = expectedKeyType === "CONFIG_KEY" ? configKeyHash : requestHash;

  if (!providedHash) {
    return {
      verified: false,
      reason: `SEB_HEADER_MISSING: Missing required header '${
        expectedKeyType === "CONFIG_KEY"
          ? "X-SafeExamBrowser-ConfigKeyHash"
          : "X-SafeExamBrowser-RequestHash"
      }'`,
    };
  }

  // Validate hex format (SHA-256 produces 64 hex characters)
  if (!/^[0-9a-fA-F]{64}$/.test(providedHash)) {
    return {
      verified: false,
      reason: "SEB_HASH_MALFORMED: Provided SEB hash is not a valid 64-character hex string",
    };
  }

  const expectedHash = computeSebHash(requestUrl, expectedKey);

  try {
    const providedBuffer = Buffer.from(providedHash.toLowerCase(), "hex");
    const expectedBuffer = Buffer.from(expectedHash.toLowerCase(), "hex");

    if (providedBuffer.length !== expectedBuffer.length) {
      return { verified: false, reason: "SEB_HASH_LENGTH_MISMATCH" };
    }

    const matches = crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    if (!matches) {
      return {
        verified: false,
        reason: "SEB_HASH_MISMATCH: Computed URL hash does not match browser client hash",
      };
    }

    return {
      verified: true,
      keyType: expectedKeyType,
    };
  } catch (err: any) {
    return {
      verified: false,
      reason: `SEB_VERIFICATION_ERROR: ${err.message}`,
    };
  }
}
