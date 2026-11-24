/**
 * AI Provider Registry & Management Service
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { encryptSecret, decryptSecret, maskSecret } from "./crypto-vault.ts";

export type ProviderType = "ollama" | "gemini" | "groq" | "custom_openai";

export interface AIProviderRecord {
  id: string;
  tenantId: string;
  providerType: ProviderType;
  providerName: string;
  baseUrl: string | null;
  modelId: string;
  keySuffix: string | null;
  maskedKey: string | null;
  isActive: boolean;
  isDefault: boolean;
  status: "NOT_CONFIGURED" | "CONFIGURED" | "READY" | "CONNECTION_FAILED" | "RATE_LIMITED";
  lastTestedAt: string | null;
  lastError: string | null;
  routingRoles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SaveProviderInput {
  id: string;
  providerType: ProviderType;
  providerName: string;
  baseUrl?: string | null;
  modelId: string;
  apiKey?: string | null;
  routingRoles?: string[];
}

export interface ConnectionTestResult {
  healthy: boolean;
  status: string;
  latencyMs: number;
  availableModels?: string[];
  testedModel?: string;
  error?: string;
}

export interface DatabaseClient {
  query(sql: string, params?: any[]): Promise<{ rows: any[] }>;
}

/**
 * Validates endpoint URLs for SSRF defense.
 */
export function validateEndpointUrl(urlStr: string): void {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error("INVALID_URL: Base URL must be a valid HTTP or HTTPS URL");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("INVALID_PROTOCOL: Base URL must use http or https");
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block AWS/Cloud metadata service IP explicitly
  if (hostname === "169.254.169.254" || hostname === "metadata.google.internal") {
    throw new Error("SSRF_BLOCKED: Cloud metadata endpoint access forbidden");
  }

  // In production, block private RFC 1918 subnets
  if (process.env.NODE_ENV === "production") {
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      throw new Error("SSRF_BLOCKED: Private network addresses are forbidden in production");
    }
  }
}

export class AIProviderService {
  db: DatabaseClient;

  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Lists all configured AI providers for the specified tenant.
   * NEVER returns plaintext API keys.
   */
  async listProviders(tenantId: string): Promise<AIProviderRecord[]> {
    const res = await this.db.query(
      `
      SELECT id, tenant_id, provider_type, provider_name, base_url, model_id,
             key_suffix, is_active, is_default, status, last_tested_at,
             last_error, routing_roles, created_at, updated_at
      FROM ai_providers
      WHERE tenant_id = $1
      ORDER BY is_default DESC, created_at ASC
    `,
      [tenantId]
    );

    return res.rows.map((r: any) => ({
      id: r.id,
      tenantId: r.tenant_id,
      providerType: r.provider_type,
      providerName: r.provider_name,
      baseUrl: r.base_url,
      modelId: r.model_id,
      keySuffix: r.key_suffix,
      maskedKey: r.key_suffix ? `••••••••${r.key_suffix}` : null,
      isActive: r.is_active,
      isDefault: r.is_default,
      status: r.status,
      lastTestedAt: r.last_tested_at ? new Date(r.last_tested_at).toISOString() : null,
      lastError: r.last_error,
      routingRoles: r.routing_roles || ["PLANNER", "RESEARCHER", "BUILDER", "REVIEWER"],
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  /**
   * Retrieves single provider record (never reveals secret).
   */
  async getProvider(tenantId: string, providerId: string): Promise<AIProviderRecord | null> {
    const res = await this.db.query(
      `
      SELECT id, tenant_id, provider_type, provider_name, base_url, model_id,
             key_suffix, is_active, is_default, status, last_tested_at,
             last_error, routing_roles, created_at, updated_at
      FROM ai_providers
      WHERE tenant_id = $1 AND id = $2
      LIMIT 1
    `,
      [tenantId, providerId]
    );

    if (res.rows.length === 0) return null;
    const r = res.rows[0];
    return {
      id: r.id,
      tenantId: r.tenant_id,
      providerType: r.provider_type,
      providerName: r.provider_name,
      baseUrl: r.base_url,
      modelId: r.model_id,
      keySuffix: r.key_suffix,
      maskedKey: r.key_suffix ? `••••••••${r.key_suffix}` : null,
      isActive: r.is_active,
      isDefault: r.is_default,
      status: r.status,
      lastTestedAt: r.last_tested_at ? new Date(r.last_tested_at).toISOString() : null,
      lastError: r.last_error,
      routingRoles: r.routing_roles || ["PLANNER", "RESEARCHER", "BUILDER", "REVIEWER"],
      createdAt: new Date(r.created_at).toISOString(),
      updatedAt: new Date(r.updated_at).toISOString(),
    };
  }

  /**
   * Saves or updates an AI provider configuration.
   * If an apiKey is provided, it is encrypted using AES-256-GCM.
   */
  async saveProvider(tenantId: string, input: SaveProviderInput): Promise<AIProviderRecord> {
    if (!input.id || !input.providerName || !input.modelId) {
      throw new Error("MISSING_REQUIRED_FIELDS: id, providerName, and modelId are required");
    }

    if (input.baseUrl) {
      validateEndpointUrl(input.baseUrl);
    }

    // Default base URLs by provider type if omitted
    let effectiveBaseUrl = input.baseUrl;
    if (!effectiveBaseUrl) {
      if (input.providerType === "ollama") effectiveBaseUrl = "http://127.0.0.1:11434/v1";
      if (input.providerType === "gemini") effectiveBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai/";
      if (input.providerType === "groq") effectiveBaseUrl = "https://api.groq.com/openai/v1";
    }

    let encryptedKey: string | null = null;
    let keySuffix: string | null = null;
    let newStatus = "NOT_CONFIGURED";

    if (input.providerType === "ollama") {
      newStatus = "CONFIGURED";
    } else if (input.apiKey && input.apiKey.trim().length > 0) {
      encryptedKey = encryptSecret(input.apiKey.trim());
      const masked = maskSecret(input.apiKey.trim());
      keySuffix = masked.suffix;
      newStatus = "CONFIGURED";
    } else {
      // Check if existing key is already preserved
      const existing = await this.db.query(
        `SELECT encrypted_api_key, key_suffix, status FROM ai_providers WHERE tenant_id = $1 AND id = $2`,
        [tenantId, input.id]
      );
      if (existing.rows.length > 0 && existing.rows[0].encrypted_api_key) {
        encryptedKey = existing.rows[0].encrypted_api_key;
        keySuffix = existing.rows[0].key_suffix;
        newStatus = existing.rows[0].status;
      }
    }

    const rolesJson = JSON.stringify(input.routingRoles || ["PLANNER", "RESEARCHER", "BUILDER", "REVIEWER"]);

    await this.db.query(
      `
      INSERT INTO ai_providers (
        id, tenant_id, provider_type, provider_name, base_url, model_id,
        encrypted_api_key, key_suffix, status, routing_roles, updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, NOW()
      )
      ON CONFLICT (tenant_id, id) DO UPDATE SET
        provider_name = EXCLUDED.provider_name,
        base_url = EXCLUDED.base_url,
        model_id = EXCLUDED.model_id,
        encrypted_api_key = COALESCE($7, ai_providers.encrypted_api_key),
        key_suffix = COALESCE($8, ai_providers.key_suffix),
        status = CASE WHEN $7 IS NOT NULL THEN 'CONFIGURED' ELSE ai_providers.status END,
        routing_roles = EXCLUDED.routing_roles,
        updated_at = NOW()
    `,
      [
        input.id,
        tenantId,
        input.providerType,
        input.providerName,
        effectiveBaseUrl,
        input.modelId,
        encryptedKey,
        keySuffix,
        newStatus,
        rolesJson,
      ]
    );

    const updated = await this.getProvider(tenantId, input.id);
    if (!updated) throw new Error("FAILED_TO_LOAD_UPDATED_PROVIDER");
    return updated;
  }

  /**
   * Internal server-side method to retrieve the decrypted API key for making live model calls.
   * NEVER expose output to HTTP responses.
   */
  async getDecryptedSecret(tenantId: string, providerId: string): Promise<string | null> {
    const res = await this.db.query(
      `SELECT encrypted_api_key, provider_type FROM ai_providers WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, providerId]
    );

    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    if (row.provider_type === "ollama") return "ollama";
    if (!row.encrypted_api_key) return null;
    return decryptSecret(row.encrypted_api_key);
  }

  /**
   * Sets a provider as active, and optionally sets it as the default provider for the tenant.
   */
  async activateProvider(tenantId: string, providerId: string, setAsDefault: boolean = false): Promise<AIProviderRecord> {
    const provider = await this.getProvider(tenantId, providerId);
    if (!provider) throw new Error(`PROVIDER_NOT_FOUND: ${providerId}`);

    if (setAsDefault) {
      // Unset all other default providers for this tenant
      await this.db.query(
        `UPDATE ai_providers SET is_default = false WHERE tenant_id = $1`,
        [tenantId]
      );
    }

    await this.db.query(
      `UPDATE ai_providers SET is_active = true, is_default = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`,
      [setAsDefault, tenantId, providerId]
    );

    const updated = await this.getProvider(tenantId, providerId);
    if (!updated) throw new Error("FAILED_TO_LOAD_ACTIVATED_PROVIDER");
    return updated;
  }

  /**
   * Removes encrypted credentials for a provider and deactivates it.
   */
  async removeCredentials(tenantId: string, providerId: string): Promise<AIProviderRecord> {
    const provider = await this.getProvider(tenantId, providerId);
    if (!provider) throw new Error(`PROVIDER_NOT_FOUND: ${providerId}`);

    await this.db.query(
      `
      UPDATE ai_providers
      SET encrypted_api_key = NULL,
          key_suffix = NULL,
          is_active = false,
          is_default = false,
          status = 'NOT_CONFIGURED',
          last_error = NULL,
          updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2
    `,
      [tenantId, providerId]
    );

    const updated = await this.getProvider(tenantId, providerId);
    if (!updated) throw new Error("FAILED_TO_LOAD_DEACTIVATED_PROVIDER");
    return updated;
  }

  /**
   * Tests connection to the provider using stored credentials.
   * Updates provider status and lastTestedAt in database.
   */
  async testConnection(tenantId: string, providerId: string): Promise<ConnectionTestResult> {
    const provider = await this.getProvider(tenantId, providerId);
    if (!provider) {
      throw new Error(`PROVIDER_NOT_FOUND: ${providerId}`);
    }

    const t0 = Date.now();
    let result: ConnectionTestResult;

    try {
      const apiKey = await this.getDecryptedSecret(tenantId, providerId);

      if (provider.providerType === "ollama") {
        result = await this.probeOllama(provider.baseUrl || "http://127.0.0.1:11434/v1", provider.modelId);
      } else if (!apiKey) {
        result = {
          healthy: false,
          status: "NOT_CONFIGURED",
          latencyMs: 0,
          error: "API key is not configured for this remote provider",
        };
      } else {
        result = await this.probeOpenAICompatible(
          provider.baseUrl || "https://api.openai.com/v1",
          apiKey,
          provider.modelId
        );
      }
    } catch (err: any) {
      result = {
        healthy: false,
        status: "CONNECTION_FAILED",
        latencyMs: Date.now() - t0,
        error: this.sanitizeErrorMessage(err.message),
      };
    }

    const updatedStatus = result.healthy ? "READY" : "CONNECTION_FAILED";
    await this.db.query(
      `
      UPDATE ai_providers
      SET status = $1,
          last_tested_at = NOW(),
          last_error = $2,
          updated_at = NOW()
      WHERE tenant_id = $3 AND id = $4
    `,
      [updatedStatus, result.error || null, tenantId, providerId]
    );

    return result;
  }

  private async probeOllama(baseUrl: string, modelId: string): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    const cleanUrl = baseUrl.replace(/\/v1\/?$/, "");
    const tagsUrl = `${cleanUrl}/api/tags`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const res = await fetch(tagsUrl, { signal: controller.signal });
      clearTimeout(timeout);
      const latencyMs = Date.now() - t0;

      if (!res.ok) {
        return {
          healthy: false,
          status: "CONNECTION_FAILED",
          latencyMs,
          error: `HTTP ${res.status}: ${res.statusText}`,
        };
      }

      const json = await res.json();
      const models = (json.models || []).map((m: any) => m.name || m.model);
      const hasModel = models.some((m: string) => m.includes(modelId));

      return {
        healthy: true,
        status: hasModel ? "READY" : "MODEL_NOT_FOUND",
        latencyMs,
        availableModels: models,
        testedModel: modelId,
        error: hasModel ? undefined : `Model '${modelId}' not found in local Ollama repository`,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        healthy: false,
        status: "CONNECTION_FAILED",
        latencyMs: Date.now() - t0,
        error: this.sanitizeErrorMessage(err.message),
      };
    }
  }

  private async probeOpenAICompatible(baseUrl: string, apiKey: string, modelId: string): Promise<ConnectionTestResult> {
    const t0 = Date.now();
    const endpoint = baseUrl.endsWith("/") ? `${baseUrl}models` : `${baseUrl}/models`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "User-Agent": "AURA-Provider-Test/1.0",
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const latencyMs = Date.now() - t0;

      if (!res.ok) {
        let errSnippet = `HTTP ${res.status} ${res.statusText}`;
        try {
          const errJson = await res.json();
          if (errJson.error?.message) errSnippet = errJson.error.message;
        } catch {}
        return {
          healthy: false,
          status: res.status === 429 ? "RATE_LIMITED" : "CONNECTION_FAILED",
          latencyMs,
          error: this.sanitizeErrorMessage(errSnippet),
        };
      }

      const json = await res.json();
      const models = Array.isArray(json.data) ? json.data.map((m: any) => m.id) : [];

      return {
        healthy: true,
        status: "READY",
        latencyMs,
        availableModels: models.slice(0, 10),
        testedModel: modelId,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      return {
        healthy: false,
        status: "CONNECTION_FAILED",
        latencyMs: Date.now() - t0,
        error: this.sanitizeErrorMessage(err.message),
      };
    }
  }

  private sanitizeErrorMessage(msg: string): string {
    if (!msg) return "Unknown error";
    // Strip anything resembling bearer tokens, api keys, or sensitive patterns
    return msg
      .replace(/Bearer\s+[A-Za-z0-9_\-\.]+/gi, "Bearer [REDACTED]")
      .replace(/key=[A-Za-z0-9_\-\.]+/gi, "key=[REDACTED]")
      .replace(/sk-[A-Za-z0-9_\-\.]+/gi, "[REDACTED_API_KEY]")
      .replace(/AIza[A-Za-z0-9_\-\.]+/gi, "[REDACTED_GEMINI_KEY]")
      .replace(/gsk_[A-Za-z0-9_\-\.]+/gi, "[REDACTED_GROQ_KEY]");
  }
}
