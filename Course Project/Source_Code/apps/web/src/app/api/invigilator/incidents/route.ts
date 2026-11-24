import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error:"Unauthorized"}, {status:401});
    if (!["INVIGILATOR","COE_ADMIN","SYSTEM_ADMIN"].includes(authUser.role)) return NextResponse.json({error:"Forbidden"}, {status:403});
    const tenantId = authUser.tenantId;

    const { searchParams } = new URL(req.url);
    const attemptId = searchParams.get("attemptId");

    let queryStr = `
      SELECT 
        epi.id,
        epi.tenant_id,
        epi.attempt_id,
        epi.incident_type,
        epi.severity,
        epi.confidence_score,
        epi.evidence,
        epi.review_status,
        epi.reviewer_notes,
        epi.action_taken,
        epi.action_notes,
        epi.created_at,
        ea.status as attempt_status,
        es.title as exam_title,
        s.institutional_student_id as usn,
        COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
      FROM exam_proctoring_incidents epi
      JOIN exam_attempts ea ON ea.id = epi.attempt_id
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      LEFT JOIN users u ON u.id = ea.student_id
      LEFT JOIN students s ON s.email = u.email
      WHERE epi.tenant_id = $1
    `;

    const params: any[] = [tenantId];
    if (attemptId) {
      queryStr += ` AND epi.attempt_id = $2`;
      params.push(attemptId);
    }

    queryStr += ` ORDER BY epi.created_at DESC LIMIT 100`;

    const result = await queryDb(queryStr, params);

    const incidents = result.rows.map((r: any) => {
      // Policy separation: Soft (environmental) vs Hard (misconduct)
      const isHardViolation = ["MULTIPLE_FACES", "UNAUTHORIZED_SOFTWARE", "SCREEN_TAMPER", "VM_DETECTED"].includes(r.incident_type) ||
        r.severity === "HIGH" || r.severity === "CRITICAL";

      return {
        id: r.id,
        attemptId: r.attempt_id,
        usn: r.usn || "DEMO001",
        studentName: r.student_name,
        examTitle: r.exam_title,
        incidentType: r.incident_type,
        severity: r.severity,
        classification: isHardViolation ? "HARD_VIOLATION" : "SOFT_ENVIRONMENTAL",
        confidenceScore: Number(r.confidence_score) || 0.85,
        evidence: r.evidence,
        reviewStatus: r.review_status,
        reviewerNotes: r.reviewer_notes,
        actionTaken: r.action_taken,
        actionNotes: r.action_notes,
        createdAt: r.created_at,
      };
    });

    return NextResponse.json({
      success: true,
      totalIncidents: incidents.length,
      incidents,
    });
  } catch (error: any) {
    logEvent("error", "Failed to retrieve invigilator incidents", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
