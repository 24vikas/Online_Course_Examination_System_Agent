import test from "node:test";
import assert from "node:assert/strict";
import { OPAEligibilityClient } from "../src/index.ts";

test("Eligibility: Fully eligible student produces ELIGIBLE decision with zero reasons", async () => {
  const client = new OPAEligibilityClient("http://localhost:9999"); // Offline test uses deterministic evaluator
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-100",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      attendancePercentage: 85.0,
      feeCleared: true,
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "ELIGIBLE");
  assert.equal(result.allow, true);
  assert.equal(result.reasons.length, 0);
  assert.equal(result.policyId, "opa.policy.exam_eligibility");
  assert.equal(result.policyVersion, "1.0.0");
  assert.ok(result.policyHash.startsWith("sha256:"));
});

test("Eligibility: Low attendance (<75%) without condonation produces INELIGIBLE", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-101",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      attendancePercentage: 72.0,
      feeCleared: true,
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "INELIGIBLE");
  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes("REASON_LOW_ATTENDANCE"));
});

test("Eligibility: Medical condonation (65-75% with approval) grants ELIGIBLE", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-102",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      attendancePercentage: 68.0,
      medicalExemptionApproved: true,
      feeCleared: true,
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "ELIGIBLE");
  assert.equal(result.allow, true);
  assert.equal(result.reasons.length, 0);
});

test("Eligibility: Severe low attendance (<65%) even with medical exemption is INELIGIBLE", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-103",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      attendancePercentage: 62.0,
      medicalExemptionApproved: true,
      feeCleared: true,
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "INELIGIBLE");
  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes("REASON_LOW_ATTENDANCE"));
});

test("Eligibility: Unpaid fees produces INELIGIBLE", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-104",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      attendancePercentage: 90.0,
      feeCleared: false,
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "INELIGIBLE");
  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes("REASON_UNPAID_FEES"));
});

test("Eligibility: Disciplinary hold produces INELIGIBLE", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-105",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      attendancePercentage: 90.0,
      feeCleared: true,
      disciplinaryHold: true,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "INELIGIBLE");
  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes("REASON_DISCIPLINARY_HOLD"));
});

test("Eligibility: Cross-tenant mismatch fails closed to INELIGIBLE", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-108",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-999", // Cross-tenant!
      enrolled: true,
      attendancePercentage: 95.0,
      feeCleared: true,
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "INELIGIBLE");
  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes("REASON_CROSS_TENANT_MISMATCH"));
});

test("Eligibility: Missing evidence fails closed to PENDING_REVIEW", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-109",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      // attendance missing
      // fee missing
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "PENDING_REVIEW");
  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes("REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING"));
  assert.ok(result.reasons.includes("REASON_INCOMPLETE_EVIDENCE:FINANCE_MISSING"));
});

test("Eligibility: Ineligible condition takes precedence over incomplete evidence", async () => {
  const client = new OPAEligibilityClient();
  const result = await client.evaluate({
    tenantId: "tenant-001",
    studentId: "student-110",
    courseOfferingId: "course-200",
    evidence: {
      tenantId: "tenant-001",
      enrolled: true,
      // attendance missing
      feeCleared: false, // Ineligible violation!
      disciplinaryHold: false,
      prerequisitesSatisfied: true,
    },
  });

  assert.equal(result.decision, "INELIGIBLE");
  assert.equal(result.allow, false);
  assert.ok(result.reasons.includes("REASON_UNPAID_FEES"));
  assert.ok(result.reasons.includes("REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING"));
});
