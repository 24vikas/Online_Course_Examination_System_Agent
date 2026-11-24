import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser || authUser.role !== "COE_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only COE_ADMIN can validate academic rosters" }, { status: 403 });
    }
    const tenantId = authUser.tenantId;
    const coeAdminId = authUser.userId;

    const body = await req.json().catch(() => ({}));
    const { termTag = "AY-2026-27-SEM-VII", notes = "COE formal academic roster validation certified." } = body;

    // 1. Count students & courses
    const studRes = await queryDb(`SELECT COUNT(*) as count FROM students WHERE tenant_id = $1;`, [tenantId]);
    const totalStudents = Number(studRes.rows[0]?.count) || 0;

    const courseRes = await queryDb(`SELECT COUNT(*) as count FROM course_offerings WHERE tenant_id = $1;`, [tenantId]);
    const totalCourses = Number(courseRes.rows[0]?.count) || 0;

    // 2. Audit Event
    await queryDb(`
      INSERT INTO audit_events (
        id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at
      ) VALUES (
        $1, $2, $3, 'COE_ROSTER_VALIDATED', 'ACADEMIC_TERM', $4, $5, NOW()
      )
    `, [
      crypto.randomUUID(),
      tenantId,
      coeAdminId,
      termTag,
      JSON.stringify({ totalStudents, totalCourses, notes, validatedBy: coeAdminId }),
    ]);

    logEvent("info", "COE validated academic roster and faculty assignments", { termTag, totalStudents, totalCourses });

    return NextResponse.json({
      success: true,
      message: `Academic roster for term '${termTag}' successfully validated (${totalStudents} students, ${totalCourses} course offerings certified).`,
      termTag,
      totalStudents,
      totalCourses,
      validatedBy: coeAdminId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logEvent("error", "Error validating roster", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
