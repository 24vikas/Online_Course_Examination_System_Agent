import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (authUser.role !== "COE_ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
    const tenantId = authUser.tenantId;
    const reviewerId = authUser.userId;
    const body = await req.json();

    const {
      grievanceId,
      action, // ASSIGN, RESOLVE, REJECT
      assignedFacultyId,
      decision = "RESOLVED", // RESOLVED, REJECTED
      newAwardedMarks,
      facultyResponse = "Review completed after rubric cross-verification against syllabus evidence.",
      coeDecision,
    } = body;

    if (!grievanceId) {
      return NextResponse.json({ error: "grievanceId is required" }, { status: 400 });
    }

    // Workflow Action 1: COE assigns grievance to faculty evaluator
    if (action === "ASSIGN" || assignedFacultyId) {
      const targetFacultyId = assignedFacultyId;
      if (!targetFacultyId) return NextResponse.json({error:"Select faculty"}, {status:400});
      const assignRes = await queryDb(`
        UPDATE student_grievances
        SET
          status = 'UNDER_FACULTY_REVIEW'::grievance_status_type,
          assigned_faculty_id = $1,
          assigned_at = NOW()
        WHERE id = $2 AND tenant_id = $3 AND EXISTS (SELECT 1 FROM tenant_memberships WHERE tenant_id=$3 AND user_id=$1 AND role='LECTURER')
        RETURNING *
      `, [targetFacultyId, grievanceId, tenantId]);

      if (assignRes.rows.length === 0) {
        return NextResponse.json({ error: "Grievance not found or tenant mismatch" }, { status: 404 });
      }

      logEvent("info", "COE assigned grievance to faculty reviewer", { grievanceId, targetFacultyId });

      return NextResponse.json({
        success: true,
        message: "Grievance assigned to faculty reviewer for formal rubric re-evaluation.",
        grievance: assignRes.rows[0],
      });
    }

    // Workflow Action 2: Faculty / COE resolution
    const dbStatus = decision.toUpperCase() === "REJECTED" ? "REJECTED" : "RESOLVED";

    const updateRes = await queryDb(`
      UPDATE student_grievances
      SET
        status = $1::grievance_status_type,
        new_awarded_marks = $2,
        faculty_remarks = $3,
        resolved_by = $4,
        resolved_at = NOW(),
        coe_decision = $5,
        coe_approved_by = $4,
        coe_approved_at = NOW()
      WHERE id = $6 AND tenant_id = $7
      RETURNING *
    `, [
      dbStatus,
      newAwardedMarks !== undefined ? newAwardedMarks : null,
      facultyResponse,
      reviewerId,
      coeDecision || (dbStatus === "RESOLVED" ? "APPROVED_REVISED" : "CONFIRMED_ORIGINAL"),
      grievanceId,
      tenantId,
    ]);

    if (updateRes.rows.length === 0) {
      return NextResponse.json({ error: "Grievance not found or tenant mismatch" }, { status: 404 });
    }

    const updated = updateRes.rows[0];

    // If new awarded marks approved, update student exam_attempts record
    if (dbStatus === "RESOLVED" && newAwardedMarks !== undefined && updated.attempt_id) {
      await queryDb(`
        UPDATE exam_attempts
        SET
          moderated_score = $1,
          total_score = $1,
          moderation_notes = 'Revised score committed following formal grievance adjudication.',
          updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
      `, [newAwardedMarks, updated.attempt_id, tenantId]);
    }

    logEvent("info", "Faculty resolved candidate grievance", {
      grievanceId,
      decision: dbStatus,
      newAwardedMarks,
      reviewerId,
    });

    return NextResponse.json({
      success: true,
      grievance: {
        id: updated.id,
        examId: updated.attempt_id,
        submissionId: updated.attempt_id,
        studentId: updated.student_id,
        status: dbStatus.toLowerCase(),
        facultyDecision: dbStatus,
        facultyRemarks: updated.faculty_remarks,
        facultyResponse: updated.faculty_remarks,
        newAwardedMarks: updated.new_awarded_marks !== null ? Number(updated.new_awarded_marks) : undefined,
        resolvedAt: updated.resolved_at,
      },
    });
  } catch (err: any) {
    logEvent("error", "Failed to resolve grievance", { error: err.message });
    return NextResponse.json({ error: err.message || "Failed to resolve grievance" }, { status: 500 });
  }
}
