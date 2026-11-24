import test from "node:test";
import assert from "node:assert/strict";
import { SessionTenantContextResolver, type MembershipRecord } from "../src/index.ts";

const TENANT_A = "11111111-1111-1111-1111-111111111111";
const TENANT_B = "22222222-2222-2222-2222-222222222222";
const TENANT_C_SPOOFED = "33333333-3333-3333-3333-333333333333";

const MOCK_DATA: MembershipRecord[] = [
  {
    membershipId: "mem-01",
    tenantId: TENANT_A,
    userId: "user-single",
    role: "STUDENT",
  },
  {
    membershipId: "mem-02",
    tenantId: TENANT_A,
    userId: "user-multi",
    role: "LECTURER",
  },
  {
    membershipId: "mem-03",
    tenantId: TENANT_B,
    userId: "user-multi",
    role: "COE_ADMIN",
  },
];

const resolver = new SessionTenantContextResolver(MOCK_DATA);

test("Tenant Context: Fails closed when user ID is empty", async () => {
  const result = await resolver.resolveFromSession("");
  assert.equal(result, null);
});

test("Tenant Context: Single membership user resolves active tenant automatically", async () => {
  const result = await resolver.resolveFromSession("user-single");
  assert.notEqual(result, null);
  assert.equal(result?.tenantId, TENANT_A);
  assert.equal(result?.role, "STUDENT");
});

test("Tenant Context: Multi-tenant user with explicit valid tenant resolves that tenant and role", async () => {
  const resultB = await resolver.resolveFromSession("user-multi", TENANT_B);
  assert.notEqual(resultB, null);
  assert.equal(resultB?.tenantId, TENANT_B);
  assert.equal(resultB?.role, "COE_ADMIN");

  const resultA = await resolver.resolveFromSession("user-multi", TENANT_A);
  assert.notEqual(resultA, null);
  assert.equal(resultA?.tenantId, TENANT_A);
  assert.equal(resultA?.role, "LECTURER");
});

test("Tenant Context: Multi-tenant user requesting an unauthorized/spoofed tenant is denied", async () => {
  const result = await resolver.resolveFromSession("user-multi", TENANT_C_SPOOFED);
  assert.equal(result, null, "Must fail closed if user does not belong to requested tenant");
});

test("Tenant Context: Multi-tenant user without explicit active tenant fails closed (avoids LIMIT 1 ambiguity)", async () => {
  const result = await resolver.resolveFromSession("user-multi");
  assert.equal(result, null, "Must fail closed when active tenant is ambiguous");
});
