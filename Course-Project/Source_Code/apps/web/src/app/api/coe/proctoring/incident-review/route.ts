import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { assertAuthorized } from "@/lib/auth";
import { DEMO_CONFIG } from "@/lib/constants";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "SYSTEM_ADMIN", "INVIGILATOR"]);
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }
    const authUser = authResult.user;
    const tenantId = authUser.tenantId || DEMO_CONFIG.tenantId;

    const body = await req.json();
    const { attemptId, incidentId, verdict, notes, actionTaken } = body;

    if (!attemptId || !verdict || !notes) {
      return NextResponse.json(
        { error: "Missing required fields: attemptId, verdict, notes" },
        { status: 400 }
      );
    }

    const allowedVerdicts = ["CONFIRMED", "FALSE_POSITIVE", "INCONCLUSIVE", "DISMISSED"];
    if (!allowedVerdicts.includes(verdict)) {
      return NextResponse.json(
        { error: `Invalid verdict: ${verdict}. Must be one of: ${allowedVerdicts.join(", ")}` },
        { status: 400 }
      );
    }

    const allowedActions = ["LOGGED", "WARNING_ISSUED", "EXAM_PAUSED", "EXAM_RESUMED", "EXAM_TERMINATED"];
    const action = actionTaken && allowedActions.includes(actionTaken) ? actionTaken : "LOGGED";

    const insertRes = await queryDb(
      `INSERT INTO exam_incident_reviews (
        tenant_id,
        attempt_id,
        incident_id,
        reviewer_id,
        reviewer_role,
        verdict,
        notes,
        action_taken,
        reviewed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        tenantId,
        attemptId,
        incidentId || null,
        authUser.userId,
        authUser.role,
        verdict,
        notes,
        action,
      ]
    );

    // If an incidentId was linked, update its review status in exam_proctoring_incidents
    if (incidentId) {
      await queryDb(
        `UPDATE exam_proctoring_incidents
         SET review_status = $1, reviewer_notes = $2, action_taken = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND tenant_id = $5`,
        [verdict, notes, action, incidentId, tenantId]
      );
    }

    logEvent("info", "Recorded human incident review verdict", {
      attemptId,
      verdict,
      reviewerId: authUser.userId,
      role: authUser.role,
    });

    return NextResponse.json({
      success: true,
      message: `Review recorded with verdict: ${verdict}`,
      review: insertRes.rows[0],
    });
  } catch (error: any) {
    logEvent("error", "Failed to record human incident review", { error: error.message });
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
