import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { assertAuthorized } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";
import { TeamFormationService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["STUDENT", "COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;
    const userId = authResult.user.userId;

    // Resolve student record
    const studRes = await queryDb(
      `SELECT id FROM students WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, userId]
    );

    let studentId = studRes.rows[0]?.id;
    if (!studentId && authResult.user.role === "STUDENT") {
      // Fallback: check by student table id directly
      studentId = userId;
    }

    // Resolve course offering
    const offRes = await queryDb(
      `SELECT id FROM course_offerings WHERE tenant_id = $1 LIMIT 1`,
      [tenantId]
    );
    const courseOfferingId = offRes.rows[0]?.id;

    if (!courseOfferingId || !studentId) {
      return NextResponse.json({ success: true, team: null });
    }

    const service = new TeamFormationService({ query: queryDb });
    const team = await service.getStudentTeam(tenantId, studentId, courseOfferingId);

    return NextResponse.json({
      success: true,
      team,
    });
  } catch (error: any) {
    logEvent("error", "Error fetching student team", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
