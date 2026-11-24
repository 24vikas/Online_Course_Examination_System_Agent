import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const { searchParams } = new URL(req.url);
    const courseCodeParam = searchParams.get("courseCode");

    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId } = authUser;

    const result = await queryDb(
      `
      SELECT 
        es.id as schedule_id,
        es.title as exam_title,
        es.start_time,
        es.end_time,
        es.duration_minutes,
        es.status,
        es.published_at,
        eb.id as blueprint_id,
        eb.title as blueprint_title,
        eb.status as blueprint_status,
        eb.total_marks,
        mc.course_code,
        mc.course_title,
        co.id as course_offering_id,
        co.section
      FROM exam_schedules es
      JOIN exam_blueprints eb ON eb.id = es.blueprint_id
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE es.tenant_id = $1 AND es.status='SCHEDULED' AND es.published_at IS NOT NULL
        AND ($2::text IS NULL OR mc.course_code = $2)
        AND EXISTS (
          SELECT 1 FROM aura_password_credentials c
          JOIN enrollments en ON en.student_id=c.student_id AND en.tenant_id=es.tenant_id
          WHERE c.membership_id=$3 AND en.course_offering_id=co.id AND en.enrollment_status='ENROLLED'
            AND (es.invigilator_membership_id IS NULL OR EXISTS (
              SELECT 1 FROM exam_schedule_candidates r WHERE r.schedule_id=es.id AND r.tenant_id=es.tenant_id AND r.student_id=c.student_id
            ))
        )
      ORDER BY es.start_time ASC
    `,
      [tenantId, courseCodeParam,authUser.membershipId]
    );

    const schedules = result.rows.map((r: any) => ({
      id: r.schedule_id,
      title: r.exam_title,
      courseCode: r.course_code,
      courseTitle: r.course_title,
      section: r.section,
      courseOfferingId: r.course_offering_id,
      blueprintId: r.blueprint_id,
      blueprintTitle: r.blueprint_title,
      blueprintStatus: r.blueprint_status,
      startTime: r.start_time,
      endTime: r.end_time,
      durationMinutes: r.duration_minutes || 60,
      totalMarks: Number(r.total_marks) || 50,
      status: r.status,
      publishedAt: r.published_at,
    }));

    return NextResponse.json({
      success: true,
      totalSchedules: schedules.length,
      schedules,
    });
  } catch (error: any) {
    logEvent("error", "Error fetching student scheduled exams", {
      error: error.message,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
