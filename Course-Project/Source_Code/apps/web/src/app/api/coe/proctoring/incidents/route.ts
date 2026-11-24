import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const res = await queryDb(
      `
      SELECT 
        ais.id,
        ais.attempt_id as "attemptId",
        ais.signal_type as "signalType",
        ais.metadata,
        ais.logged_at as "loggedAt",
        ais.review_status as "reviewStatus",
        ais.review_notes as "reviewNotes",
        ais.reviewed_at as "reviewedAt",
        s.institutional_student_id as "studentId",
        TRIM(CONCAT(s.first_name, ' ', s.last_name)) as "studentName",
        es.title as "examTitle"
      FROM attempt_integrity_signals ais
      JOIN exam_attempts ea ON ea.id = ais.attempt_id
      JOIN students s ON s.id = ea.student_id
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      WHERE ais.tenant_id = $1
      ORDER BY ais.logged_at DESC
      LIMIT 50
    `,
      [tenantId]
    );

    return NextResponse.json({
      success: true,
      incidents: res.rows.map((r: any) => ({
        id: r.id,
        attemptId: r.attemptId,
        signalType: r.signalType,
        metadata: r.metadata,
        loggedAt: new Date(r.loggedAt).toISOString(),
        reviewStatus: r.reviewStatus,
        reviewNotes: r.reviewNotes,
        reviewedAt: r.reviewedAt ? new Date(r.reviewedAt).toISOString() : null,
        studentId: r.studentId,
        studentName: r.studentName,
        examTitle: r.examTitle,
      })),
    });
  } catch (error: any) {
    logEvent("error", "Error listing proctoring incidents", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;
    const reviewerId = authResult.user.userId;

    const body = await req.json();
    const { signalId, reviewStatus, reviewNotes } = body;

    if (!signalId || !reviewStatus) {
      return NextResponse.json(
        { error: "signalId and reviewStatus are required" },
        { status: 400 }
      );
    }

    if (!["DISMISSED_BENIGN", "FLAGGED_MISCONDUCT", "PENDING_REVIEW"].includes(reviewStatus)) {
      return NextResponse.json({ error: "Invalid reviewStatus" }, { status: 400 });
    }

    await queryDb(
      `
      UPDATE attempt_integrity_signals
      SET review_status = $1,
          reviewed_by = $2,
          review_notes = $3,
          reviewed_at = NOW()
      WHERE tenant_id = $4 AND id = $5
    `,
      [reviewStatus, reviewerId, reviewNotes || "", tenantId, signalId]
    );

    logEvent("info", "Proctoring incident reviewed", {
      tenantId,
      signalId,
      reviewerId,
      reviewStatus,
    });

    return NextResponse.json({
      success: true,
      message: `Incident '${signalId}' review updated to ${reviewStatus}`,
    });
  } catch (error: any) {
    logEvent("error", "Error reviewing proctoring incident", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
