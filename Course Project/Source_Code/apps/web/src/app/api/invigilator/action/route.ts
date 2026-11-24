import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["INVIGILATOR", "COE_ADMIN", "SYSTEM_ADMIN"].includes(authUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { tenantId, userId: invigilatorId } = authUser;

    const body = await req.json().catch(() => ({}));
    const action = body.action || body.actionType;
    const attemptId = body.attemptId;
    const incidentId = body.incidentId;
    const studentId = body.studentId;
    const reason = body.reason || body.notes || "Standard invigilator supervision action";
    const metadata = body.metadata || {};

    if (!action || !attemptId) {
      return NextResponse.json(
        { error: "action (or actionType) and attemptId are required" },
        { status: 400 }
      );
    }

    const validActions = [
      "WARN_CANDIDATE",
      "PAUSE_EXAM",
      "RESUME_EXAM",
      "REQUEST_RECHECK",
      "ESCALATE_REVIEW",
      "ESCALATE_COE",
      "DISMISS_BENIGN",
      "TERMINATE_ATTEMPT",
    ];

    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: `Invalid action. Must be one of: ${validActions.join(", ")}` },
        { status: 400 }
      );
    }

    const attempt = await queryDb(
      "SELECT 1 FROM exam_attempts WHERE id = $1 AND tenant_id = $2", [attemptId, tenantId]
    );
    if (!attempt.rowCount) return NextResponse.json({ error: "Attempt unavailable" }, { status: 404 });
    const auditEventId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 1. Attempt and Session State Transitions
    if (action === "PAUSE_EXAM") {
      await queryDb(
        `UPDATE exam_attempts SET status = 'PAUSED', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [attemptId, tenantId]
      );
      await queryDb(
        `UPDATE exam_proctoring_sessions SET status = 'PAUSED', updated_at = NOW() WHERE attempt_id = $1 AND tenant_id = $2`,
        [attemptId, tenantId]
      );
    } else if (action === "RESUME_EXAM") {
      await queryDb(
        `UPDATE exam_attempts SET status = 'IN_PROGRESS', submitted_at = NULL, updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [attemptId, tenantId]
      );
      await queryDb(
        `UPDATE exam_proctoring_sessions SET status = 'IN_EXAM', updated_at = NOW() WHERE attempt_id = $1 AND tenant_id = $2`,
        [attemptId, tenantId]
      );
    } else if (action === "REQUEST_RECHECK") {
      await queryDb(
        `UPDATE exam_proctoring_sessions SET identity_status = 'RECHECK_REQUESTED', updated_at = NOW() WHERE attempt_id = $1 AND tenant_id = $2`,
        [attemptId, tenantId]
      );
    } else if (action === "TERMINATE_ATTEMPT") {
      await queryDb(
        `UPDATE exam_attempts SET status = 'EXPIRED', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [attemptId, tenantId]
      );
      await queryDb(
        `UPDATE exam_proctoring_sessions SET status = 'TERMINATED', updated_at = NOW() WHERE attempt_id = $1 AND tenant_id = $2`,
        [attemptId, tenantId]
      );
    }

    // 2. Incident Update if incidentId provided
    if (incidentId) {
      let reviewStatus = "FLAGGED";
      if (action === "DISMISS_BENIGN") reviewStatus = "DISMISSED";
      else if (action === "TERMINATE_ATTEMPT") reviewStatus = "CONFIRMED_VIOLATION";
      else if (action === "ESCALATE_COE" || action === "ESCALATE_REVIEW") reviewStatus = "ESCALATED";

      await queryDb(
        `
        UPDATE exam_proctoring_incidents
        SET action_taken = $1,
            action_notes = $2,
            action_timestamp = NOW(),
            reviewer_id = $3,
            reviewer_notes = $2,
            review_status = $4,
            reviewed_at = NOW()
        WHERE id = $5 AND tenant_id = $6 AND attempt_id = $7
      `,
        [action, reason, invigilatorId, reviewStatus, incidentId, tenantId, attemptId]
      );
    }

    // 3. Insert integrity signal / note for historical tracing
    try {
      await queryDb(
        `
        INSERT INTO attempt_integrity_signals (
          id, tenant_id, attempt_id, signal_type, metadata, logged_at, review_status
        ) VALUES (
          $1, $2, $3, $4, $5, NOW(), 'CONFIRMED'
        )
      `,
        [
          crypto.randomUUID(),
          tenantId,
          attemptId,
          `INVIGILATOR_ACTION_${action}`,
          JSON.stringify({
            action,
            actionType: action,
            invigilatorId,
            reason,
            metadata,
            timestamp: now,
          }),
        ]
      );
    } catch (e) {
      // Table may be auxiliary, non-blocking
    }

    // 4. Immutable Audit Event Log
    await queryDb(
      `
      INSERT INTO audit_events (
        id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at
      ) VALUES (
        $1, $2, $3, $4, 'EXAM_ATTEMPT', $5, $6, NOW()
      )
    `,
      [
        auditEventId,
        tenantId,
        invigilatorId,
        `PROCTOR_${action}`,
        attemptId,
        JSON.stringify({
          action,
          actionType: action,
          studentId,
          reason,
          incidentId,
          invigilatorId,
        }),
      ]
    );

    logEvent("info", `Invigilator action executed: ${action}`, {
      attemptId,
      invigilatorId,
      action,
      reason,
      auditEventId,
    });

    return NextResponse.json({
      success: true,
      auditEventId,
      actionId: auditEventId,
      action,
      actionType: action,
      attemptId,
      incidentId: incidentId || null,
      timestamp: now,
      executedAt: now,
      message: `Action ${action} executed and audited successfully.`,
    });
  } catch (error: any) {
    logEvent("error", "Error executing invigilator action", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
