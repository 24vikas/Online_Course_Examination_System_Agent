import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  encryptSecret,
  decryptSecret,
  maskSecret,
  redactSensitiveObject,
} from "../src/crypto-vault.ts";
import {
  AIProviderService,
  validateEndpointUrl,
  type DatabaseClient,
} from "../src/ai-provider-service.ts";

describe("PHASE 14: SECURE AI PROVIDER ONBOARDING & CRYPTO VAULT", () => {
  // 1. Crypto Vault Tests
  test("1. AES-256-GCM encryption and decryption roundtrip", () => {
    const rawSecret = "gsk_testSecretKeyForGroqProvider1234567890abcdef";
    const encrypted = encryptSecret(rawSecret);

    assert.notEqual(encrypted, rawSecret);
    assert.equal(encrypted.split(":").length, 3, "Payload should be iv:tag:ciphertext");

    const decrypted = decryptSecret(encrypted);
    assert.equal(decrypted, rawSecret);
  });

  test("2. Tamper resistance: corrupted ciphertext or auth tag fails closed", () => {
    const rawSecret = "sk-superSecretOpenAIKey";
    const encrypted = encryptSecret(rawSecret);
    const [iv, tag, cipher] = encrypted.split(":");

    // Tamper with ciphertext by flipping last hex char
    const tamperedCipher = cipher.slice(0, -1) + (cipher.slice(-1) === "a" ? "b" : "a");
    const tamperedPayload = `${iv}:${tag}:${tamperedCipher}`;

    assert.throws(
      () => decryptSecret(tamperedPayload),
      /DECRYPTION_FAILED/,
      "Tampered payload must trigger authentication tag failure"
    );
  });

  test("3. Masking formats credentials safely (••••••••abcd)", () => {
    const res = maskSecret("AIzaSyAbcd1234567890XYZW");
    assert.equal(res.suffix, "XYZW");
    assert.equal(res.masked, "••••••••XYZW");

    const shortRes = maskSecret("abc");
    assert.equal(shortRes.suffix, "abc");
    assert.equal(shortRes.masked, "••••••••abc");
  });

  test("4. Deep redaction strips sensitive keys recursively from objects", () => {
    const sensitiveData = {
      user: "admin",
      apiKey: "sk-plainSecretKey",
      authorization: "Bearer my-secret-token",
      nested: {
        password: "SuperSecretPassword123!",
        safeField: 42,
      },
    };

    const scrubbed = redactSensitiveObject(sensitiveData);
    assert.equal(scrubbed.apiKey, "[REDACTED]");
    assert.equal(scrubbed.authorization, "[REDACTED]");
    assert.equal(scrubbed.nested.password, "[REDACTED]");
    assert.equal(scrubbed.nested.safeField, 42);
    assert.equal(scrubbed.user, "admin");
  });

  // 2. SSRF URL Defense Tests
  test("5. Endpoint validator blocks SSRF cloud metadata and invalid protocols", () => {
    assert.doesNotThrow(() => validateEndpointUrl("https://api.groq.com/openai/v1"));
    assert.doesNotThrow(() => validateEndpointUrl("http://127.0.0.1:11434/v1"));

    assert.throws(
      () => validateEndpointUrl("http://169.254.169.254/latest/meta-data"),
      /SSRF_BLOCKED/
    );
    assert.throws(
      () => validateEndpointUrl("ftp://api.example.com"),
      /INVALID_PROTOCOL/
    );
    assert.throws(
      () => validateEndpointUrl("not-a-valid-url"),
      /INVALID_URL/
    );
  });

  // 3. AI Provider Registry Service Tests (with in-memory mock DB)
  test("6. Provider CRUD with encrypted secrets and masked API output", async () => {
    const mockStore: Record<string, any> = {};

    const mockDb: DatabaseClient = {
      async query(sql: string, params: any[] = []) {
        if (sql.includes("SELECT") && sql.includes("FROM ai_providers")) {
          const tenantId = params[0];
          const providerId = params[1];
          if (providerId) {
            const row = mockStore[`${tenantId}:${providerId}`];
            return { rows: row ? [row] : [] };
          }
          const rows = Object.values(mockStore).filter((r) => r.tenant_id === tenantId);
          return { rows };
        }

        if (sql.includes("INSERT INTO ai_providers")) {
          const [
            id,
            tenant_id,
            provider_type,
            provider_name,
            base_url,
            model_id,
            encrypted_api_key,
            key_suffix,
            status,
            rolesJson,
          ] = params;

          mockStore[`${tenant_id}:${id}`] = {
            id,
            tenant_id,
            provider_type,
            provider_name,
            base_url,
            model_id,
            encrypted_api_key,
            key_suffix,
            status,
            routing_roles: JSON.parse(rolesJson),
            is_active: false,
            is_default: false,
            last_tested_at: null,
            last_error: null,
            created_at: new Date(),
            updated_at: new Date(),
          };
          return { rows: [mockStore[`${tenant_id}:${id}`]] };
        }

        if (sql.includes("UPDATE ai_providers SET is_default = false")) {
          const tenant_id = params[0];
          for (const key of Object.keys(mockStore)) {
            if (mockStore[key].tenant_id === tenant_id) {
              mockStore[key].is_default = false;
            }
          }
          return { rows: [] };
        }

        if (sql.includes("UPDATE ai_providers SET is_active = true")) {
          const [setAsDefault, tenant_id, provider_id] = params;
          const target = mockStore[`${tenant_id}:${provider_id}`];
          if (target) {
            target.is_active = true;
            target.is_default = setAsDefault;
          }
          return { rows: [] };
        }

        if (sql.includes("SET encrypted_api_key = NULL")) {
          const [tenant_id, provider_id] = params;
          const target = mockStore[`${tenant_id}:${provider_id}`];
          if (target) {
            target.encrypted_api_key = null;
            target.key_suffix = null;
            target.is_active = false;
            target.is_default = false;
            target.status = "NOT_CONFIGURED";
          }
          return { rows: [] };
        }

        return { rows: [] };
      },
    };

    const service = new AIProviderService(mockDb);
    const tenantId = "tenant-test-01";

    // A. Save new remote provider with secret
    const saved = await service.saveProvider(tenantId, {
      id: "groq-test",
      providerType: "groq",
      providerName: "Groq Cloud Llama 3.3",
      modelId: "llama-3.3-70b-versatile",
      apiKey: "gsk_prodKey1234567890wxyz",
    });

    assert.equal(saved.id, "groq-test");
    assert.equal(saved.maskedKey, "••••••••wxyz");
    assert.equal(saved.status, "CONFIGURED");
    assert.ok(mockStore[`${tenantId}:groq-test`].encrypted_api_key.includes(":"));

    // B. List providers never returns raw secret
    const list = await service.listProviders(tenantId);
    assert.equal(list.length, 1);
    assert.equal(list[0].maskedKey, "••••••••wxyz");
    assert.equal((list[0] as any).encrypted_api_key, undefined);

    // C. Internal secret retrieval for backend requests
    const decryptedSecret = await service.getDecryptedSecret(tenantId, "groq-test");
    assert.equal(decryptedSecret, "gsk_prodKey1234567890wxyz");

    // D. Activation & Default toggle
    const activated = await service.activateProvider(tenantId, "groq-test", true);
    assert.equal(activated.isActive, true);
    assert.equal(activated.isDefault, true);

    // E. Remove credentials clears key material and resets status
    const cleared = await service.removeCredentials(tenantId, "groq-test");
    assert.equal(cleared.status, "NOT_CONFIGURED");
    assert.equal(cleared.maskedKey, null);
    assert.equal(cleared.isActive, false);

    const checkSecret = await service.getDecryptedSecret(tenantId, "groq-test");
    assert.equal(checkSecret, null);
  });
});
