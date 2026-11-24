import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { TeamFormationService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;
    const adminUserId = authResult.user.userId;

    const body = await req.json();
    const { courseOfferingId, teams } = body;

    if (!courseOfferingId || !teams || !Array.isArray(teams) || teams.length === 0) {
      return NextResponse.json(
        { error: "courseOfferingId and non-empty teams array are required to commit." },
        { status: 400 }
      );
    }

    const service = new TeamFormationService({ query: queryDb });
    const result = await service.commitApprovedTeams(tenantId, adminUserId, courseOfferingId, teams);

    logEvent("info", "Approved teams committed to database", {
      tenantId,
      courseOfferingId,
      committedTeamsCount: result.committedTeamsCount,
      committedMembersCount: result.committedMembersCount,
    });

    return NextResponse.json({
      success: true,
      ...result,
      message: `Successfully locked and committed ${result.committedTeamsCount} teams with ${result.committedMembersCount} student memberships.`,
    });
  } catch (error: any) {
    logEvent("error", "Error committing approved teams", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
