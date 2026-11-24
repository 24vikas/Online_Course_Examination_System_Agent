import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { DEMO_CONFIG } from "../../../../../lib/constants";
import { resolveAuth } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser || authUser.role !== "COE_ADMIN") {
      logEvent("warn", "Unauthorized attempt to publish results", {
        user: authUser?.userId,
        role: authUser?.role,
      });
      return NextResponse.json(
        { error: "Forbidden: Only COE_ADMIN can publish exam results" },
        { status: 403 }
      );
    }
    const coeAdminId = authUser.userId;
    const body = await req.json().catch(() => ({}));

    const tenantId = authUser.tenantId;
    const scheduleId = body.scheduleId;
    const attemptId = body.attemptId;

    if (!attemptId && !scheduleId) return NextResponse.json({error:"Select an attempt or schedule"}, {status:400});
    const result = await queryDb(`
      WITH changed AS (
        UPDATE exam_attempts
        SET status='RELEASED',
            results_published_at=now(),
            results_published_by=$4,
            moderated_at=COALESCE(moderated_at, now()),
            moderated_score=COALESCE(moderated_score, total_score),
            updated_at=now()
        WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id=$2) AND ($3::uuid IS NULL OR exam_schedule_id=$3)
          AND results_published_at IS NULL
        RETURNING id
      ), audited AS (
        INSERT INTO audit_events(id,tenant_id,user_id,action,resource_type,resource_id,metadata_json)
        SELECT $5,$1,$4,'PUBLISH_EXAM_RESULTS','EXAM_COHORT',
          COALESCE($2,$3)::text,jsonb_build_object('reason',$6::text,'count',count(*)) FROM changed HAVING count(*)>0
      ) SELECT id FROM changed
    `, [tenantId, attemptId || null, scheduleId || null, coeAdminId, crypto.randomUUID(), body.reason || "Manual COE release"]);
    const releasedAttemptsCount = result.rows.length;
    if (!releasedAttemptsCount) return NextResponse.json({error:"Submission unavailable"}, {status:404});

    logEvent("info", "COE Administrator released examination results", { scheduleId, coeAdminId, releasedAttemptsCount });

    return NextResponse.json({
      success: true,
      message: `AUTHORIZATION CONFIRMED: Examination results released for ${releasedAttemptsCount} candidate attempts.`,
      scheduleId: scheduleId || "ALL_ACTIVE",
      releasedAttemptsCount,
      publishedAt: new Date().toISOString(),
      publishedBy: {
        id: coeAdminId,
        email: authUser?.email || DEMO_CONFIG.users.coeAdmin.email,
        role: "COE_ADMIN",
      },
    });
  } catch (error: any) {
    logEvent("error", "Error publishing exam results", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
