import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (authUser.role !== "COE_ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
    const tenantId = authUser.tenantId;

    const result = await queryDb(`
      SELECT g.*, u.email as student_email,
             COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Student Candidate') as student_name
      FROM student_grievances g
      LEFT JOIN users u ON g.student_id = u.id
      LEFT JOIN students s ON s.email = u.email AND s.tenant_id = g.tenant_id
      WHERE g.tenant_id = $1
      ORDER BY g.created_at DESC
    `, [tenantId]);

    const grievances = result.rows.map((r) => ({
      id: r.id,
      examId: r.attempt_id,
      examTitle: r.exam_title || "Course 26ECAC401: Agentic AI Examination",
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
    logEvent("error", "Failed to fetch COE grievances", { error: err.message });
    return NextResponse.json({ error: err.message || "Failed to fetch grievances" }, { status: 500 });
  }
}
