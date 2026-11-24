import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (authUser.role !== "LECTURER") return NextResponse.json({error: "Forbidden"}, {status: 403});
    const {tenantId, userId: lecturerId} = authUser;

    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get("scheduleId") || searchParams.get("examScheduleId");
    const offeringId = searchParams.get("offeringId") || searchParams.get("courseOfferingId");

    let queryStr = `
      SELECT 
        ea.id as attempt_id,
        ea.tenant_id,
        ea.exam_schedule_id,
        ea.status,
        ea.objective_score,
        ea.subjective_score,
        ea.total_score,
        ea.max_marks,
        ea.submitted_at,
        es.title as exam_title,
        mc.course_code,
        mc.course_title,
        s.institutional_student_id as usn,
        u.email as student_email,
        COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
      FROM exam_attempts ea
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      JOIN course_offerings co ON co.id = ea.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      LEFT JOIN users u ON u.id = ea.student_id
      LEFT JOIN students s ON s.email = u.email AND s.tenant_id = ea.tenant_id
      WHERE ea.tenant_id = $1 AND co.tenant_id = ea.tenant_id AND es.tenant_id = ea.tenant_id
        AND es.course_offering_id = co.id AND ea.results_published_at IS NULL AND ea.moderated_at IS NULL
        AND ea.status::text IN ('SUBMITTED','OBJECTIVE_SCORED','FACULTY_REVIEW','AWAITING_SUBJECTIVE_MARKING')
        AND (co.primary_lecturer_id = $2 OR EXISTS (
          SELECT 1 FROM faculty_course_assignments f WHERE f.tenant_id = ea.tenant_id
          AND f.course_offering_id = co.id AND f.faculty_id = $2 AND f.is_active
          AND f.role_in_course IN ('PRIMARY_LECTURER','CO_LECTURER','EVALUATOR')))
    `;

    const params: any[] = [tenantId, lecturerId];
    if (scheduleId) {
      params.push(scheduleId);
      queryStr += ` AND ea.exam_schedule_id = $${params.length}`;
    }
    if (offeringId) {
      params.push(offeringId);
      queryStr += ` AND ea.course_offering_id = $${params.length}`;
    }

    queryStr += ` ORDER BY ea.submitted_at DESC NULLS LAST, ea.created_at DESC LIMIT 50`;

    const result = await queryDb(queryStr, params);

    const submissions = result.rows.map((r: any) => ({
      attemptId: r.attempt_id,
      usn: r.usn,
      studentName: r.student_name,
      studentEmail: r.student_email,
      courseCode: r.course_code,
      courseTitle: r.course_title,
      examTitle: r.exam_title,
      status: r.status,
      objectiveScore: Number(r.objective_score) || 0,
      subjectiveScore: r.subjective_score !== null ? Number(r.subjective_score) : null,
      totalScore: Number(r.total_score) || 0,
      maxMarks: Number(r.max_marks) || 50,
      submittedAt: r.submitted_at,
      needsSubjectiveGrading:
        (r.status !== "RELEASED" && r.status !== "RESULT_PUBLISHED") ||
        Number(r.subjective_score) === 0 ||
        r.subjective_score === null ||
        r.status === "OBJECTIVE_SCORED" ||
        r.status === "SUBMITTED" ||
        r.status === "AWAITING_SUBJECTIVE_MARKING" ||
        r.status === "FACULTY_REVIEW",
    }));

    return NextResponse.json({
      success: true,
      totalSubmissions: submissions.length,
      pendingCount: submissions.filter((s: any) => s.needsSubjectiveGrading).length,
      submissions,
    });
  } catch (error: any) {
    logEvent("error", "Error fetching lecturer marking queue", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
