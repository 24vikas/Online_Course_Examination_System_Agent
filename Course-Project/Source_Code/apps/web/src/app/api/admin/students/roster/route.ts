import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const { searchParams } = new URL(req.url);
    const semester = searchParams.get("semester");
    const status = searchParams.get("status");

    let sql = `
      SELECT s.id, s.institutional_student_id as "studentId",
             s.first_name as "firstName", s.last_name as "lastName",
             s.current_semester as "currentSemester", s.academic_status as "academicStatus",
             u.email, s.created_at as "enrolledAt"
      FROM students s
      JOIN users u ON u.id = s.user_id
      WHERE s.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (semester) {
      params.push(Number(semester));
      sql += ` AND s.current_semester = $${params.length}`;
    }
    if (status) {
      params.push(status);
      sql += ` AND s.academic_status = $${params.length}`;
    }

    sql += ` ORDER BY s.current_semester ASC, s.institutional_student_id ASC LIMIT 200`;

    const res = await queryDb(sql, params);

    return NextResponse.json({
      success: true,
      students: res.rows,
      count: res.rows.length,
    });
  } catch (error: any) {
    logEvent("error", "Error fetching student roster", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
