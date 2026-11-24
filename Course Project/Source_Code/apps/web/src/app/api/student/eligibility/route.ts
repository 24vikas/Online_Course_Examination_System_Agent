import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { resolveAuth } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;
    const requestedStudent = req.nextUrl.searchParams.get("studentId");
    if (requestedStudent && requestedStudent !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // 1. Check existing authoritative snapshot in database for this student
    const snapRes = await queryDb(
      `SELECT id, decision, allow, reasons, policy_id, policy_version, evaluator_version, evidence_snapshot, evaluated_at
       FROM eligibility_snapshots
       WHERE tenant_id = $1 AND student_id = $2
       ORDER BY evaluated_at DESC LIMIT 1`,
      [tenantId, studentId]
    );

    if (snapRes.rows.length > 0) {
      const snap = snapRes.rows[0];
      const reasons = Array.isArray(snap.reasons) ? snap.reasons : (typeof snap.reasons === "string" ? JSON.parse(snap.reasons) : []);
      return NextResponse.json({
        success: true,
        studentId,
        eligibility: {
          id: snap.id,
          decision: snap.decision,
          allow: snap.allow,
          reasons,
          policyId: snap.policy_id,
          policyVersion: snap.policy_version,
          evaluatorVersion: snap.evaluator_version,
          evaluatedAt: snap.evaluated_at,
          evidence: snap.evidence_snapshot,
        },
      });
    }

    return NextResponse.json({
      success: true,
      studentId,
      eligibility: {
        decision: "PENDING_VERIFICATION",
        allow: false,
        reasons: ["No verified eligibility evidence is available."],
      },
    });
  } catch (error: any) {
    logEvent("error", "Eligibility evaluation error", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
