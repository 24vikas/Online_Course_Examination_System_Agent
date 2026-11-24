import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { assertAuthorized } from "@/lib/auth";
import { DEMO_CONFIG } from "@/lib/constants";
import { examIntegrityReviewAgent } from "@/lib/agents/examIntegrityReviewAgent";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "SYSTEM_ADMIN", "INVIGILATOR", "LECTURER"]);
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }
    const authUser = authResult.user;
    const tenantId = authUser.tenantId || DEMO_CONFIG.tenantId;

    const { searchParams } = new URL(req.url);
    const attemptId = searchParams.get("attemptId");

    if (!attemptId) {
      return NextResponse.json({ error: "Missing required parameter: attemptId" }, { status: 400 });
    }

    const summaryRes = await queryDb(
      `SELECT irs.*, ea.status as attempt_status, es.title as exam_title,
              s.institutional_student_id as usn,
              COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
       FROM integrity_review_summaries irs
       JOIN exam_attempts ea ON ea.id = irs.attempt_id
       JOIN exam_schedules es ON es.id = irs.exam_schedule_id
       LEFT JOIN users u ON u.id = irs.student_id
       LEFT JOIN students s ON s.email = u.email
       WHERE irs.attempt_id = $1 AND irs.tenant_id = $2`,
      [attemptId, tenantId]
    );

    if (summaryRes.rows.length === 0) {
      // Generate on-the-fly if not already persisted
      const result = await examIntegrityReviewAgent.analyzeAttempt(attemptId, tenantId);
      return NextResponse.json({ success: true, summary: result });
    }

    const row = summaryRes.rows[0];
    return NextResponse.json({
      success: true,
      summary: {
        attemptId: row.attempt_id,
        examScheduleId: row.exam_schedule_id,
        studentId: row.student_id,
        studentUsn: row.usn,
        studentName: row.student_name,
        riskLevel: row.risk_level,
        confidenceScore: parseFloat(row.confidence_score),
        totalIncidents: row.total_incidents,
        incidentBreakdown: row.incident_breakdown,
        timelineSummary: row.timeline_summary,
        agentSummaryText: row.agent_summary_text,
        citedIncidentIds: row.cited_incident_ids,
        recommendations: row.recommendations,
        dataQualityFlags: row.data_quality_flags,
        generatedByAgent: row.generated_by_agent,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error: any) {
    logEvent("error", "Failed to retrieve or generate integrity review summary", { error: error.message });
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "SYSTEM_ADMIN", "INVIGILATOR"]);
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }
    const authUser = authResult.user;
    const tenantId = authUser.tenantId || DEMO_CONFIG.tenantId;

    const body = await req.json();
    const { attemptId } = body;

    if (!attemptId) {
      return NextResponse.json({ error: "Missing required field: attemptId" }, { status: 400 });
    }

    const summary = await examIntegrityReviewAgent.analyzeAttempt(attemptId, tenantId);

    return NextResponse.json({
      success: true,
      message: "Exam integrity review summary generated and persisted successfully",
      summary,
    });
  } catch (error: any) {
    logEvent("error", "Failed to run exam integrity review agent", { error: error.message });
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
