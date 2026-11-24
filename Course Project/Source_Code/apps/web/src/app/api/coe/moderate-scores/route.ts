import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser || authUser.role !== "COE_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only COE_ADMIN can moderate scores" }, { status: 403 });
    }
    const tenantId = authUser.tenantId;
    const coeAdminId = authUser.userId;

    const body = await req.json().catch(() => ({}));
    const {
      scheduleId,
      attemptId,
      moderationDelta = 0, // e.g. +2.0 marks
      moderationNotes = "COE Board statistical moderation applied across cohort.",
      moderatedScore, // if setting explicit score for single attempt
    } = body;

    if (!attemptId && !scheduleId) return NextResponse.json({error:"Select an attempt or schedule"}, {status:400});
    const result = await queryDb(`
      WITH changed AS (
        UPDATE exam_attempts SET moderated_score=LEAST(max_marks,GREATEST(0,COALESCE($7::numeric,total_score+$8::numeric))), moderation_notes=$9, moderated_by=$4, moderated_at=now(), updated_at=now()
        WHERE tenant_id=$1 AND ($2::uuid IS NULL OR id=$2) AND ($3::uuid IS NULL OR exam_schedule_id=$3)
          AND results_published_at IS NULL AND status::text IN ('FACULTY_REVIEW','OBJECTIVE_SCORED','AWAITING_MODERATION')
        RETURNING id
      ), audited AS (
        INSERT INTO audit_events(id,tenant_id,user_id,action,resource_type,resource_id,metadata_json)
        SELECT $5,$1,$4,'COE_MODERATION_APPLIED','EXAM_COHORT',
          COALESCE($2,$3)::text,jsonb_build_object('reason',$6::text,'count',count(*)) FROM changed HAVING count(*)>0
      ) SELECT id FROM changed
    `, [tenantId, attemptId || null, scheduleId || null, coeAdminId, crypto.randomUUID(), moderationNotes, moderatedScore ?? null, Number(moderationDelta), moderationNotes]);
    const affectedRows = result.rows.length;
    if (!affectedRows) return NextResponse.json({error:"Submission unavailable"}, {status:404});

    logEvent("info", "COE moderation committed", { scheduleId, attemptId, moderationDelta, affectedRows });

    return NextResponse.json({
      success: true,
      message: `Moderation successfully applied to ${affectedRows} candidate records.`,
      affectedRows,
      moderationDelta: Number(moderationDelta),
      moderatedBy: coeAdminId,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logEvent("error", "Error applying moderation", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
