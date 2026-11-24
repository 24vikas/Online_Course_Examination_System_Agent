import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { TeamFormationService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const body = await req.json();
    const {
      courseOfferingId,
      semester,
      minTeamSize,
      maxTeamSize,
      targetTeamSize,
      strategy,
      seed,
      isOwnerCriteriaSupplied,
    } = body;

    // Resolve courseOfferingId if not provided
    let offeringId = courseOfferingId;
    if (!offeringId) {
      const offRes = await queryDb(
        `SELECT id FROM course_offerings WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      if (offRes.rows.length > 0) {
        offeringId = offRes.rows[0].id;
      } else {
        return NextResponse.json({ error: "No course offering found for tenant." }, { status: 400 });
      }
    }

    const service = new TeamFormationService({ query: queryDb });
    const preview = await service.previewAllocation(tenantId, {
      courseOfferingId: offeringId,
      semester: semester ? Number(semester) : 7,
      minTeamSize: minTeamSize ? Number(minTeamSize) : 3,
      maxTeamSize: maxTeamSize ? Number(maxTeamSize) : 5,
      targetTeamSize: targetTeamSize ? Number(targetTeamSize) : 4,
      strategy: strategy || "BALANCED_SECTION",
      seed: seed ? Number(seed) : 42,
      isOwnerCriteriaSupplied: Boolean(isOwnerCriteriaSupplied),
    });

    logEvent("info", "Team formation preview generated", {
      tenantId,
      semester,
      status: preview.status,
      teamCount: preview.projectedTeamCount,
    });

    return NextResponse.json({
      success: true,
      preview,
    });
  } catch (error: any) {
    logEvent("error", "Error generating team formation preview", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
