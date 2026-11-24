import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { ProctorCompanionService } from "@exam-system/api";
import { checkProctoredAttemptActive } from "../../../../../lib/proctoring/proctorAuthorization";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["STUDENT", "COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;
    const studentUserId = authResult.user.userId;

    const { searchParams } = new URL(req.url);
    const attemptId = searchParams.get("attemptId");

    if (!attemptId) {
      return NextResponse.json({ error: "attemptId parameter is required" }, { status: 400 });
    }

    const attLookup = await queryDb(
      `SELECT c.student_id, ea.student_id AS attempt_user_id,
              ea.status = 'IN_PROGRESS' AND ea.submitted_at IS NULL
                AND ea.server_deadline > clock_timestamp() AS attempt_open,
              EXISTS (
                SELECT 1 FROM exam_proctoring_sessions ps WHERE ps.attempt_id = ea.id
                  AND ps.tenant_id = ea.tenant_id AND ps.telemetry_expires_at > clock_timestamp()
                  AND ps.last_heartbeat_at > clock_timestamp() - interval '15 seconds'
              ) AS fresh_companion
         FROM exam_attempts ea
        LEFT JOIN aura_password_credentials c ON c.membership_id = $4
       WHERE ea.id = $1 AND ea.tenant_id = $2 AND ($3::uuid IS NULL OR ea.student_id = $3)`,
      [attemptId, tenantId, authResult.user.role === "STUDENT" ? studentUserId : null, authResult.user.membershipId]
    );
    const attempt = attLookup.rows[0];
    if (!attempt || (authResult.user.role === "STUDENT" && !attempt.student_id)) {
      return NextResponse.json({ error: "Attempt unavailable" }, { status: 404 });
    }
    const studentId = attempt.attempt_user_id;

    // Extract headers for SEB verification
    const headersRecord: Record<string, string> = {};
    req.headers.forEach((val, key) => {
      headersRecord[key.toLowerCase()] = val;
    });

    const examUrl = `${req.nextUrl.origin}/student/exam/${attemptId}`;
    const service = new ProctorCompanionService({ query: queryDb });

    const gate = await service.evaluateEntryGate(
      tenantId,
      attemptId,
      studentId,
      headersRecord,
      examUrl
    );

    // Strict proctor authorization contract check
    const proctorCheck = await checkProctoredAttemptActive(authResult.user, attemptId, "GATE_CHECK");
    if (!proctorCheck.allowed) {
      gate.reasons.push(proctorCheck.reason || "PROCTOR_COMPANION_REQUIRED");
    }

    if (!attempt.attempt_open) gate.reasons.push("ATTEMPT_CLOSED");
    if (!attempt.fresh_companion) gate.reasons.push("AUTHENTICATED_COMPANION_HEARTBEAT_REQUIRED");
    gate.canEnterExam = gate.reasons.length === 0;

    logEvent("info", "Exam entry gate evaluated", {
      tenantId,
      attemptId,
      canEnterExam: gate.canEnterExam,
      sessionStatus: gate.sessionStatus,
      sebStatus: gate.sebStatus,
      proctorAllowed: proctorCheck.allowed,
    });

    return NextResponse.json({
      success: true,
      gate,
    });
  } catch (error: any) {
    logEvent("error", "Error evaluating exam entry gate", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
