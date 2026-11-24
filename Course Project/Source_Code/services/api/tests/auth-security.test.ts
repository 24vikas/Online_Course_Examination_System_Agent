/**
 * Phase 11 Security Test Suite: Authentication & Tenancy Hardening
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";

// Simulated user membership repository representing canonical database state
interface MockMembership {
  userId: string;
  email: string;
  role: "COE_ADMIN" | "LECTURER" | "STUDENT";
  tenantId: string;
  status: "ACTIVE" | "SUSPENDED";
}

const MOCK_DB_MEMBERSHIPS: MockMembership[] = [
  {
    userId: "usr-coe-admin-01",
    email: "coe@example.invalid",
    role: "COE_ADMIN",
    tenantId: "tenant-kle-tech",
    status: "ACTIVE",
  },
  {
    userId: "usr-lecturer-01",
    email: "faculty@example.invalid",
    role: "LECTURER",
    tenantId: "tenant-kle-tech",
    status: "ACTIVE",
  },
  {
    userId: "usr-student-01",
    email: "student@example.invalid",
    role: "STUDENT",
    tenantId: "tenant-kle-tech",
    status: "ACTIVE",
  },
];

/**
 * Pure verification logic mirroring apps/web/src/lib/auth.ts
 */
function resolveAuthPure(
  headers: Record<string, string>,
  env: { NODE_ENV: string; ALLOW_DEMO_HEADER_AUTH?: string }
): { userId: string; role: string; tenantId: string } | null {
  const isProduction = env.NODE_ENV === "production";
  const allowDemoHeaders = env.ALLOW_DEMO_HEADER_AUTH === "true" && !isProduction;

  let verifiedUserId: string | null = null;
  let requestedTenantId: string | null = null;

  const authHeader = headers["authorization"];
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();
    if (!isProduction) {
      if (token === "token-coe") verifiedUserId = "usr-coe-admin-01";
      else if (token === "token-lecturer") verifiedUserId = "usr-lecturer-01";
      else if (token === "token-student") verifiedUserId = "usr-student-01";
    }
    if (token.startsWith("ey")) {
      // Decode JWT tenant if present
    }
  }

  if (headers["x-tenant-id"]) {
    requestedTenantId = headers["x-tenant-id"];
  }

  // Demo headers permitted ONLY in non-production when ALLOW_DEMO_HEADER_AUTH is explicitly true
  if (!verifiedUserId && allowDemoHeaders) {
    if (headers["x-user-id"]) {
      verifiedUserId = headers["x-user-id"];
    } else if (headers["x-user-role"]) {
      if (headers["x-user-role"] === "COE_ADMIN") verifiedUserId = "usr-coe-admin-01";
      else if (headers["x-user-role"] === "LECTURER") verifiedUserId = "usr-lecturer-01";
      else if (headers["x-user-role"] === "STUDENT") verifiedUserId = "usr-student-01";
    }
  }

  if (!verifiedUserId) {
    return null;
  }

  // Look up user in canonical database: Role is ALWAYS determined by DB, NEVER by client header!
  const targetTenant = requestedTenantId || "tenant-kle-tech";
  const membership = MOCK_DB_MEMBERSHIPS.find(
    (m) => m.userId === verifiedUserId && m.tenantId === targetTenant && m.status === "ACTIVE"
  );

  if (!membership) {
    return null;
  }

  return {
    userId: membership.userId,
    role: membership.role,
    tenantId: membership.tenantId,
  };
}

test("P0 Security: Production mode rejects client headers without valid Bearer token", () => {
  const headers = {
    "x-user-role": "COE_ADMIN",
    "x-user-id": "usr-coe-admin-01",
    "x-tenant-id": "tenant-kle-tech",
  };

  const resolved = resolveAuthPure(headers, {
    NODE_ENV: "production",
    ALLOW_DEMO_HEADER_AUTH: "true", // Should be ignored in production!
  });

  assert.equal(resolved, null, "Production mode must strictly return null when Bearer token is absent");
});

test("P0 Security: Student cannot escalate to COE_ADMIN by passing x-user-role header", () => {
  // A student authenticates as usr-student-01 but passes x-user-role: COE_ADMIN
  const headers = {
    authorization: "Bearer token-student",
    "x-user-role": "COE_ADMIN",
  };

  const resolved = resolveAuthPure(headers, {
    NODE_ENV: "development",
    ALLOW_DEMO_HEADER_AUTH: "true",
  });

  assert.ok(resolved !== null);
  assert.equal(resolved.userId, "usr-student-01");
  // Database membership role must prevail over malicious header
  assert.equal(resolved.role, "STUDENT", "Role must be resolved from database record, not client header");
});

test("P0 Security: Client cannot access another tenant without active membership", () => {
  const headers = {
    authorization: "Bearer token-lecturer",
    "x-tenant-id": "tenant-foreign-university",
  };

  const resolved = resolveAuthPure(headers, {
    NODE_ENV: "development",
    ALLOW_DEMO_HEADER_AUTH: "true",
  });

  assert.equal(resolved, null, "Must fail closed when active membership does not exist for target tenant");
});

test("P0 Security: Valid Bearer token correctly resolves verified role and tenant", () => {
  const headers = {
    authorization: "Bearer token-coe",
  };

  const resolved = resolveAuthPure(headers, {
    NODE_ENV: "development",
    ALLOW_DEMO_HEADER_AUTH: "true",
  });

  assert.ok(resolved !== null);
  assert.equal(resolved.userId, "usr-coe-admin-01");
  assert.equal(resolved.role, "COE_ADMIN");
  assert.equal(resolved.tenantId, "tenant-kle-tech");
});

test("P0 Security (Phase 15): Production mode strictly rejects demo tokens even if ALLOW_DEMO_HEADER_AUTH=true", () => {
  const demoTokens = ["token-coe", "token-lecturer", "token-student"];

  for (const token of demoTokens) {
    const headers = {
      authorization: `Bearer ${token}`,
      "x-tenant-id": "tenant-kle-tech",
    };

    const resolved = resolveAuthPure(headers, {
      NODE_ENV: "production",
      ALLOW_DEMO_HEADER_AUTH: "true", // Must be ignored in production!
    });

    assert.equal(
      resolved,
      null,
      `Production mode must reject demo token '${token}' even when ALLOW_DEMO_HEADER_AUTH=true`
    );
  }
});

test("P0 Security (Phase 15): Non-production rejects demo headers if ALLOW_DEMO_HEADER_AUTH=false", () => {
  const headers = {
    "x-user-role": "LECTURER",
    "x-tenant-id": "tenant-kle-tech",
  };

  const resolved = resolveAuthPure(headers, {
    NODE_ENV: "development",
    ALLOW_DEMO_HEADER_AUTH: "false",
  });

  assert.equal(resolved, null, "Must reject demo headers when ALLOW_DEMO_HEADER_AUTH is false in development");
});
