import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;

    const body = await req.json().catch(() => ({}));
    const {
      attemptId,
      consentVersion = "1.0-kletech-honor-code",
      cameraVerified = true,
      screenShareVerified = true,
      sebVerified = true,
      isSimulatedStream = false,
      hardwareNotes = "Camera and screen share preflight verified.",
    } = body;

    if (!attemptId) {
      return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
    }

    // 1. Verify Attempt ownership and tenant
    const attRes = await queryDb(`
      SELECT ea.id, ea.student_id, ea.status, es.id as schedule_id, es.title as exam_title
      FROM exam_attempts ea
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      WHERE ea.tenant_id = $1 AND ea.id = $2 AND ea.student_id = $3
      LIMIT 1
    `, [tenantId, attemptId, studentId]);

    if (attRes.rows.length === 0) {
      return NextResponse.json({ error: "Attempt not found" }, { status: 404 });
    }

    const preflightSummary = {
      cameraVerified: Boolean(cameraVerified),
      screenShareVerified: Boolean(screenShareVerified),
      sebVerified: Boolean(sebVerified),
      isSimulatedStream: Boolean(isSimulatedStream),
      hardwareNotes,
      preflightCompletedAt: new Date().toISOString(),
    };

    // 2. Persist consent and preflight audit record in attempt_proctor_consents
    await queryDb(`
      INSERT INTO attempt_proctor_consents (
        tenant_id, attempt_id, student_id, consent_version, preflight_summary,
        seb_verified, ip_address, user_agent, consented_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, NOW()
      )
      ON CONFLICT DO NOTHING
    `, [
      tenantId,
      attemptId,
      studentId,
      consentVersion,
      JSON.stringify(preflightSummary),
      Boolean(sebVerified),
      req.headers.get("x-forwarded-for") || "127.0.0.1",
      req.headers.get("user-agent") || "AURA-Preflight-Client/1.0",
    ]);

    logEvent("info", "Candidate completed proctoring preflight", { attemptId, studentId, preflightSummary });

    return NextResponse.json({
      success: true,
      message: "Preflight and honor code consent recorded.",
      attemptId,
      preflightSummary,
    });
  } catch (error: any) {
    logEvent("error", "Error processing preflight", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
