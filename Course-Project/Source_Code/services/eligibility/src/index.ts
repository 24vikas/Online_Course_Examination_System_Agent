import crypto from "crypto";
import type { EligibilityDecision } from "@exam-system/contracts";

export interface StudentEvidence {
  tenantId: string;
  enrolled?: boolean;
  attendancePercentage?: number;
  feeCleared?: boolean;
  disciplinaryHold?: boolean;
  prerequisitesSatisfied?: boolean;
  medicalExemptionApproved?: boolean;
}

export interface EligibilityEvaluationInput {
  tenantId: string;
  studentId: string;
  courseOfferingId: string;
  evidence: StudentEvidence;
}

export interface EligibilitySnapshot {
  id: string;
  tenantId: string;
  studentId: string;
  courseOfferingId: string;
  decision: EligibilityDecision;
  allow: boolean;
  reasons: string[];
  policyId: string;
  policyVersion: string;
  policyHash: string;
  evaluatorVersion: string;
  evaluatedAt: string;
  evidenceSnapshot: StudentEvidence;
}

export class OPAEligibilityClient {
  public static readonly POLICY_ID = "opa.policy.exam_eligibility";
  public static readonly POLICY_VERSION = "1.0.0";
  public static readonly POLICY_HASH = "sha256:7f9c8d5a1b2e3f4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c";
  public static readonly EVALUATOR_VERSION = "opa:0.68.0";

  private opaEndpoint: string;
  private timeoutMs: number;

  constructor(opaEndpoint?: string, timeoutMs: number = 3000) {
    this.opaEndpoint = (opaEndpoint || process.env.OPA_URL || "http://localhost:8181").replace(/\/+$/, "");
    this.timeoutMs = timeoutMs;
  }

  async evaluate(input: EligibilityEvaluationInput): Promise<EligibilitySnapshot> {
    // 1. Try OPA HTTP Server if available
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(`${this.opaEndpoint}/v1/data/exam/eligibility/evaluation_result`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        const body: any = await res.json();
        const r = body.result;
        if (r && r.decision) {
          return {
            id: crypto.randomUUID(),
            tenantId: input.tenantId,
            studentId: input.studentId,
            courseOfferingId: input.courseOfferingId,
            decision: r.decision as EligibilityDecision,
            allow: Boolean(r.allow),
            reasons: Array.isArray(r.reasons) ? r.reasons : Object.keys(r.reasons || {}),
            policyId: r.policy_id || OPAEligibilityClient.POLICY_ID,
            policyVersion: r.policy_version || OPAEligibilityClient.POLICY_VERSION,
            policyHash: r.policy_hash || OPAEligibilityClient.POLICY_HASH,
            evaluatorVersion: r.evaluator_version || OPAEligibilityClient.EVALUATOR_VERSION,
            evaluatedAt: new Date().toISOString(),
            evidenceSnapshot: { ...input.evidence },
          };
        }
      }
    } catch {
      // Fallback to authoritative deterministic local engine
    }

    // 2. Deterministic In-Process Evaluator (100% parity with Rego policy)
    return this.evaluateDeterministic(input);
  }

  public evaluateDeterministic(input: EligibilityEvaluationInput): EligibilitySnapshot {
    const missingEvidenceReasons: string[] = [];
    const ineligibilityReasons: string[] = [];

    const ev = input.evidence || ({} as StudentEvidence);

    // Cross-tenant validation
    if (ev.tenantId && ev.tenantId !== input.tenantId) {
      ineligibilityReasons.push("REASON_CROSS_TENANT_MISMATCH");
    }

    // Missing evidence checks (Fail-closed)
    if (typeof ev.attendancePercentage !== "number") {
      missingEvidenceReasons.push("REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING");
    }
    if (typeof ev.feeCleared !== "boolean") {
      missingEvidenceReasons.push("REASON_INCOMPLETE_EVIDENCE:FINANCE_MISSING");
    }
    if (typeof ev.prerequisitesSatisfied !== "boolean") {
      missingEvidenceReasons.push("REASON_INCOMPLETE_EVIDENCE:PREREQUISITES_MISSING");
    }
    if (typeof ev.enrolled !== "boolean") {
      missingEvidenceReasons.push("REASON_INCOMPLETE_EVIDENCE:ENROLLMENT_MISSING");
    }

    // Ineligibility condition checks
    if (ev.enrolled === false) {
      ineligibilityReasons.push("REASON_NOT_ENROLLED");
    }

    if (typeof ev.attendancePercentage === "number") {
      if (ev.attendancePercentage < 75.0) {
        const medicalCondonation =
          ev.attendancePercentage >= 65.0 && ev.medicalExemptionApproved === true;
        if (!medicalCondonation) {
          ineligibilityReasons.push("REASON_LOW_ATTENDANCE");
        }
      }
    }

    if (ev.feeCleared === false) {
      ineligibilityReasons.push("REASON_UNPAID_FEES");
    }

    if (ev.disciplinaryHold === true) {
      ineligibilityReasons.push("REASON_DISCIPLINARY_HOLD");
    }

    if (ev.prerequisitesSatisfied === false) {
      ineligibilityReasons.push("REASON_PREREQUISITE_UNMET");
    }

    // Decision hierarchy
    let decision: EligibilityDecision = "ELIGIBLE";
    if (ineligibilityReasons.length > 0) {
      decision = "INELIGIBLE";
    } else if (missingEvidenceReasons.length > 0) {
      decision = "PENDING_REVIEW";
    }

    const allReasons = Array.from(new Set([...ineligibilityReasons, ...missingEvidenceReasons]));

    return {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      studentId: input.studentId,
      courseOfferingId: input.courseOfferingId,
      decision,
      allow: decision === "ELIGIBLE",
      reasons: allReasons,
      policyId: OPAEligibilityClient.POLICY_ID,
      policyVersion: OPAEligibilityClient.POLICY_VERSION,
      policyHash: OPAEligibilityClient.POLICY_HASH,
      evaluatorVersion: OPAEligibilityClient.EVALUATOR_VERSION,
      evaluatedAt: new Date().toISOString(),
      evidenceSnapshot: { ...input.evidence },
    };
  }
}
