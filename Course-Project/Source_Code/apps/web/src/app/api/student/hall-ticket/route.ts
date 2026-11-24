import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;

    // 1. Fetch Student profile & eligibility snapshot
    const studRes = await queryDb(`
      SELECT 
        s.id as student_id,
        s.institutional_student_id as usn,
        s.first_name,
        s.last_name,
        s.email,
        es.decision,
        es.allow,
        es.reasons,
        es.policy_id
      FROM students s
      LEFT JOIN eligibility_snapshots es ON (es.student_id = $2 OR es.student_id = s.id) AND es.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1 AND s.id = (SELECT student_id FROM aura_password_credentials WHERE membership_id = $3)
      ORDER BY es.evaluated_at DESC NULLS LAST
      LIMIT 1
    `, [tenantId, studentId, authUser.membershipId]);

    const studentData = studRes.rows[0];
    if (!studentData) return NextResponse.json({ error: "Student unavailable" }, { status: 404 });

    // 2. Fetch Active Examination Schedule
    const schedRes = await queryDb(`
      SELECT 
        es.id as schedule_id,
        es.title as exam_title,
        es.start_time,
        es.end_time,
        es.duration_minutes,
        es.status,
        mc.course_code,
        mc.course_title,
        co.section
      FROM exam_schedules es
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE es.tenant_id = $1
      ORDER BY es.created_at DESC
      LIMIT 1
    `, [tenantId]);

    const schedule = schedRes.rows[0] || {
      schedule_id: DEMO_CONFIG.examScheduleId,
      exam_title: "Distributed Systems Mid-Semester Examination 2026",
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 86400000).toISOString(),
      duration_minutes: 60,
      course_code: "CS-301",
      course_title: "Distributed Systems & Cloud Computing",
      section: "A",
    };

    const isEligible = studentData.decision === "ELIGIBLE" && studentData.allow === true;

    // Cryptographic verification token
    const verificationString = `${tenantId}:${studentData.usn}:${schedule.schedule_id}:${schedule.course_code}`;
    const hallTicketHash = crypto.createHash("sha256").update(verificationString).digest("hex");

    const hallTicket = {
      ticketNumber: `HT-${studentData.usn}-${schedule.course_code}`,
      institution: "KLE Technological University, Hubballi",
      department: "School of Computer Science & Engineering",
      academicYear: "AY 2026–27",
      semester: "Semester VII",
      student: {
        studentId: studentData.student_id,
        usn: studentData.usn,
        fullName: `${studentData.first_name} ${studentData.last_name}`,
        email: studentData.email,
        eligibilityStatus: isEligible ? "ELIGIBLE" : "INELIGIBLE",
        eligibilityReasons: studentData.reasons,
      },
      examination: {
        scheduleId: schedule.schedule_id,
        examTitle: schedule.exam_title,
        courseCode: schedule.course_code,
        courseTitle: schedule.course_title,
        section: schedule.section,
        durationMinutes: schedule.duration_minutes,
        startTime: schedule.start_time,
        endTime: schedule.end_time,
        roomNumber: "Tech Park Lab 304",
        seatDesignation: `SEAT-${studentData.usn.slice(-3)}`,
      },
      verification: {
        isIssued: isEligible,
        issuedAt: new Date().toISOString(),
        verificationToken: hallTicketHash.slice(0, 32).toUpperCase(),
        qrPayload: `kletech://exam-admit?usn=${studentData.usn}&schedule=${schedule.schedule_id}&token=${hallTicketHash.slice(0, 16)}`,
      },
    };

    logEvent("info", "Hall ticket generated for candidate", { usn: studentData.usn, isEligible });

    return NextResponse.json({
      success: true,
      hallTicket,
    });
  } catch (error: any) {
    logEvent("error", "Error generating hall ticket", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
