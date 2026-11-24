import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { assertAuthorized } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const res = await queryDb(
      `
      SELECT t.id as "teamId", t.team_name as "teamName", t.team_number as "teamNumber",
             t.status, count(tm.id)::int as "memberCount",
             json_agg(json_build_object(
               'studentId', s.id,
               'usn', s.institutional_student_id,
               'name', TRIM(CONCAT(s.first_name, ' ', s.last_name)),
               'role', tm.role
             )) as members
      FROM student_teams t
      LEFT JOIN team_memberships tm ON tm.team_id = t.id
      LEFT JOIN students s ON s.id = tm.student_id
      WHERE t.tenant_id = $1
      GROUP BY t.id, t.team_name, t.team_number, t.status
      ORDER BY t.team_number ASC
      `,
      [tenantId]
    );

    return NextResponse.json({
      success: true,
      teams: res.rows,
      count: res.rows.length,
    });
  } catch (error: any) {
    logEvent("error", "Error listing student teams", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
