import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    const {tenantId, userId: studentId} = authUser;
    const userRole = (authUser?.role as string) || "";
    const isFacultyOrAdmin = userRole === "LECTURER" || userRole === "COE_ADMIN" || userRole === "FACULTY" || userRole === "COE_AUTHOR";


    if (!isFacultyOrAdmin && authUser.role !== "STUDENT") return NextResponse.json({error: "Forbidden"}, {status: 403});
    let rows: any[];
    if (isFacultyOrAdmin) {
      const result = await queryDb(`
        SELECT g.*, u.email as student_email,
               COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Student Candidate') as student_name
        FROM student_grievances g
        LEFT JOIN users u ON g.student_id = u.id
        LEFT JOIN students s ON s.email = u.email AND s.tenant_id = g.tenant_id
        WHERE g.tenant_id = $1 AND ($2::boolean OR g.assigned_faculty_id = $3)
        ORDER BY g.created_at DESC
      `, [tenantId, authUser.role === "COE_ADMIN", authUser.userId]);
      rows = result.rows;
    } else {
      const result = await queryDb(`
        SELECT g.*, u.email as student_email,
               COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Student Candidate') as student_name
        FROM student_grievances g
        LEFT JOIN users u ON g.student_id = u.id
        LEFT JOIN students s ON s.email = u.email AND s.tenant_id = g.tenant_id
        WHERE g.tenant_id = $1 AND g.student_id = $2
        ORDER BY g.created_at DESC
      `, [tenantId, studentId]);
      rows = result.rows;
    }

    const grievances = rows.map((r) => ({
      id: r.id,
      examId: r.attempt_id,
      examTitle: r.exam_title || "Course 26ECAC401: Agentic AI Semester Examination",
      submissionId: r.attempt_id,
      studentId: r.student_id,
      studentUid: r.student_id,
      studentName: r.student_name || "Student Candidate",
      studentEmail: r.student_email || "student.aura@example.invalid",
      questionId: r.question_key || r.question_id || "q1",
      subject: r.subject || r.grievance_type,
      description: r.statement,
      reason: r.statement,
      syllabusReference: r.syllabus_reference || "Course 26ECAC401 Syllabus Plan",
      currentMarks: Number(r.current_marks) || 0,
      requestedMarks: Number(r.requested_marks) || 0,
      newAwardedMarks: r.new_awarded_marks !== null ? Number(r.new_awarded_marks) : undefined,
      status: (r.status || "SUBMITTED").toLowerCase() === "submitted" ? "pending" : (r.status || "pending").toLowerCase(),
      facultyDecision: r.status,
      facultyRemarks: r.faculty_remarks,
      facultyResponse: r.faculty_remarks,
      aiAnalysis: r.ai_analysis,
      createdAt: r.created_at,
      updatedAt: r.resolved_at || r.created_at,
    }));

    return NextResponse.json({ success: true, grievances });
  } catch (err: any) {
    logEvent("error", "Failed to get grievances", { error: err.message });
    return NextResponse.json({ error: err.message || "Failed to retrieve grievances" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    const {tenantId, userId: studentId} = authUser;

    if (authUser.role !== "STUDENT") return NextResponse.json({error: "Forbidden"}, {status: 403});
    const body = await req.json();

    const {
      attemptId,
      submissionId,
      questionId,
      subject = "Assessment Evaluation Grievance",
      reason = "Scoring discrepancy in rubric application",
      syllabusCitation = "Course 26ECAC401 Syllabus",
      currentMarks = 0,
      requestedMarks = 0,
      examTitle = "Course 26ECAC401: Agentic AI Examination",
    } = body;

    const validAttemptId = attemptId || submissionId;
    if (!z.string().uuid().safeParse(validAttemptId).success) {
      return NextResponse.json({error: "Invalid attempt"}, {status: 400});
    }

    const insertResult = await queryDb(`
      INSERT INTO student_grievances (
        tenant_id, attempt_id, student_id, grievance_type, statement,
        status, subject, exam_title, question_key, current_marks,
        requested_marks, syllabus_reference, created_at
      ) SELECT
        $1, $2, $3, 'DISPUTED_SCORE', $4,
        'SUBMITTED', $5, $6, $7, $8,
        $9, $10, NOW()
      FROM exam_attempts ea WHERE ea.id = $2 AND ea.tenant_id = $1 AND ea.student_id = $3
      RETURNING *
    `, [
      tenantId,
      validAttemptId,
      studentId,
      reason,
      subject,
      examTitle,
      questionId || "q1",
      currentMarks,
      requestedMarks,
      syllabusCitation,
    ]);

    if (!insertResult.rowCount) return NextResponse.json({error: "Attempt unavailable"}, {status: 404});
    const created = insertResult.rows[0];

    logEvent("info", "Candidate submitted revaluation grievance", {
      grievanceId: created.id,
      studentId,
      questionId,
    });

    return NextResponse.json({
      success: true,
      grievance: {
        id: created.id,
        examId: created.attempt_id,
        examTitle: created.exam_title,
        submissionId: created.attempt_id,
        studentId: created.student_id,
        questionId: created.question_key,
        subject: created.subject,
        description: created.statement,
        reason: created.statement,
        syllabusReference: created.syllabus_reference,
        currentMarks: Number(created.current_marks),
        requestedMarks: Number(created.requested_marks),
        status: "pending",
        facultyDecision: "PENDING",
        createdAt: created.created_at,
        updatedAt: created.created_at,
      },
    }, { status: 201 });
  } catch (err: any) {
    logEvent("error", "Failed to submit grievance", { error: err.message });
    return NextResponse.json({ error: err.message || "Failed to submit grievance" }, { status: 500 });
  }
}
