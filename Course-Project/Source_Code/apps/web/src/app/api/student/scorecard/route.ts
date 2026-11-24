import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;

    const { searchParams } = new URL(req.url);
    const attemptIdParam = searchParams.get("attemptId");

    let attemptRow: any = null;

    if (attemptIdParam) {
      const attRes = await queryDb(`
        SELECT 
          ea.id, ea.tenant_id, ea.exam_schedule_id, ea.course_offering_id, ea.student_id,
          ea.status, ea.server_start_time, ea.server_deadline, ea.submitted_at,
          ea.objective_score, ea.subjective_score, ea.total_score, ea.moderated_score,
          ea.max_marks, ea.results_published_at,
          es.title as exam_title, es.duration_minutes,
          mc.course_code, mc.course_title,
          u.email as student_email,
          s.institutional_student_id as usn,
          COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
        FROM exam_attempts ea
        JOIN exam_schedules es ON es.id = ea.exam_schedule_id
        JOIN course_offerings co ON co.id = ea.course_offering_id
        JOIN master_courses mc ON mc.id = co.master_course_id
        LEFT JOIN users u ON u.id = ea.student_id
        LEFT JOIN students s ON s.email = u.email AND s.tenant_id = ea.tenant_id
        WHERE ea.id = $1 AND ea.tenant_id = $2 AND ea.student_id = $3
        LIMIT 1
      `, [attemptIdParam, tenantId, studentId]);
      if (attRes.rows.length > 0) attemptRow = attRes.rows[0];
    }

    if (!attemptRow) {
      // Find latest attempt for authenticated student
      const latestRes = await queryDb(`
        SELECT 
          ea.id, ea.tenant_id, ea.exam_schedule_id, ea.course_offering_id, ea.student_id,
          ea.status, ea.server_start_time, ea.server_deadline, ea.submitted_at,
          ea.objective_score, ea.subjective_score, ea.total_score, ea.moderated_score,
          ea.max_marks, ea.results_published_at,
          es.title as exam_title, es.duration_minutes,
          mc.course_code, mc.course_title,
          u.email as student_email,
          s.institutional_student_id as usn,
          COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
        FROM exam_attempts ea
        JOIN exam_schedules es ON es.id = ea.exam_schedule_id
        JOIN course_offerings co ON co.id = ea.course_offering_id
        JOIN master_courses mc ON mc.id = co.master_course_id
        LEFT JOIN users u ON u.id = ea.student_id
        LEFT JOIN students s ON s.email = u.email AND s.tenant_id = ea.tenant_id
        WHERE ea.student_id = $1 AND ea.tenant_id = $2
        ORDER BY ea.created_at DESC
        LIMIT 1
      `, [studentId, tenantId]);

      if (latestRes.rows.length > 0) {
        attemptRow = latestRes.rows[0];
      }
    }

    if (!attemptRow) {
      return NextResponse.json({
        success: false,
        error: "No examination attempt found for candidate",
      }, { status: 404 });
    }

    // AUDIT-04 Answer Key Quarantine:
    // Fetch student responses WITHOUT exposing correct answers
    const responsesRes = await queryDb(`
      SELECT 
        ar.id, ar.question_id, ar.answer_json, ar.sequence_number, ar.saved_at,
        qb.question_text as question_prompt,
        qb.bloom_level, qb.marks as max_marks, qb.question_type
      FROM attempt_responses ar
      JOIN question_bank qb ON qb.id = ar.question_id
      WHERE ar.attempt_id = $1
      ORDER BY ar.sequence_number ASC
    `, [attemptRow.id]);

    const finalMarks = attemptRow.moderated_score !== null && attemptRow.moderated_score !== undefined
      ? Number(attemptRow.moderated_score)
      : (attemptRow.total_score !== null ? Number(attemptRow.total_score) : 0);

    const maxMarks = Number(attemptRow.max_marks) || 50;
    const percentage = maxMarks > 0 ? ((finalMarks / maxMarks) * 100).toFixed(1) : "0.0";

    const isPublished = attemptRow.status === "RELEASED" || attemptRow.status === "RESULT_PUBLISHED" || !!attemptRow.results_published_at;

    const scoring = isPublished ? {
      objectiveScore: Number(attemptRow.objective_score) || 0,
      subjectiveScore: Number(attemptRow.subjective_score) || 0,
      rawTotalScore: Number(attemptRow.total_score) || 0,
      moderatedScore: attemptRow.moderated_score !== null ? Number(attemptRow.moderated_score) : null,
      finalScore: finalMarks,
      maxMarks: maxMarks,
      percentage: Number(percentage),
      gradeBand: Number(percentage) >= 90 ? "S (Outstanding)" : Number(percentage) >= 80 ? "A (Excellent)" : Number(percentage) >= 70 ? "B (Very Good)" : Number(percentage) >= 60 ? "C (Good)" : Number(percentage) >= 50 ? "D (Pass)" : "F (Fail)",
    } : null;

    const scorecard = {
      attemptId: attemptRow.id,
      studentId: attemptRow.student_id,
      studentName: attemptRow.student_name,
      studentEmail: attemptRow.student_email,
      usn: attemptRow.usn || "DEMO001",
      courseCode: attemptRow.course_code,
      courseTitle: attemptRow.course_title,
      examTitle: attemptRow.exam_title,
      status: isPublished ? "RELEASED" : (attemptRow.status || "SUBMITTED"),
      canonicalState: isPublished
        ? "RESULT_PUBLISHED"
        : (attemptRow.status === "AWAITING_MODERATION" || attemptRow.status === "FACULTY_REVIEW" || attemptRow.moderated_score !== null)
        ? "AWAITING_MODERATION"
        : (attemptRow.status === "AWAITING_SUBJECTIVE_MARKING" || attemptRow.status === "OBJECTIVE_SCORED")
        ? "AWAITING_SUBJECTIVE_MARKING"
        : (attemptRow.status === "OBJECTIVE_SCORING")
        ? "OBJECTIVE_SCORING"
        : "SUBMITTED",
      isPublished,
      withheldReason: isPublished ? null : "Results are undergoing faculty review and COE moderation. Official marks will be revealed upon formal COE release.",
      submittedAt: attemptRow.submitted_at,
      resultsPublishedAt: attemptRow.results_published_at,
      scoring,
      responses: responsesRes.rows.map((r: any) => ({
        questionId: r.question_id,
        sequenceNumber: r.sequence_number,
        questionPrompt: r.question_prompt,
        bloomLevel: r.bloom_level,
        maxMarks: Number(r.max_marks),
        submittedAnswer: r.answer_json,
        // Answer keys strictly withheld (AUDIT-04 compliance)
      })),
    };

    logEvent("info", "Scorecard fetched for candidate", { attemptId: attemptRow.id, studentId });

    return NextResponse.json({
      success: true,
      scorecard,
    });
  } catch (error: any) {
    logEvent("error", "Failed to retrieve student scorecard", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
