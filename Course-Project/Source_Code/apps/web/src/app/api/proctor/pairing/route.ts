import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { resolveAuth } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";
import { z } from "zod";
import { handleCorsPreflight, jsonWithCors } from "../../../../lib/cors";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return handleCorsPreflight();
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return jsonWithCors({ error: "Forbidden" }, { status: 403 });
    const body = await req.json().catch(() => ({}));
    const attemptId = body?.attemptId;
    if (!z.string().uuid().safeParse(attemptId).success) return jsonWithCors({ error: "Invalid attempt" }, { status: 400 });
    const ttlSeconds = typeof body.ttlSeconds === "number" && body.ttlSeconds > 0 ? Math.min(body.ttlSeconds, 600) : 120;

    // 1. Authoritative attempt & candidate lookup from PostgreSQL
    const attRes = await queryDb(
      `
      SELECT 
        ea.id, s.id AS student_id, ea.tenant_id,
        s.institutional_student_id as usn,
        COALESCE(TRIM(s.first_name || ' ' || COALESCE(s.last_name, '')), s.email, 'Candidate') as student_name,
        es.title as exam_title,
        mc.course_code
      FROM exam_attempts ea
      JOIN aura_password_credentials c ON c.membership_id = $4
      JOIN students s ON s.id = c.student_id AND s.tenant_id = ea.tenant_id AND s.is_active
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE ea.id = $1 AND ea.tenant_id = $2 AND ea.student_id = $3
        AND ea.status = 'IN_PROGRESS' AND ea.submitted_at IS NULL AND ea.server_deadline > clock_timestamp()
      LIMIT 1
      `,
      [attemptId, authUser.tenantId, authUser.userId, authUser.membershipId]
    );

    if (!attRes.rowCount) return jsonWithCors({ error: "Attempt unavailable" }, { status: 403 });
    const { tenant_id: tenantId, student_id: studentId, student_name: studentName,
      usn: studentUsn, exam_title: examTitle } = attRes.rows[0];
    const pinCode = crypto.randomInt(10_000_000, 100_000_000).toString();
    const pinCodeHash = crypto.createHash("sha256").update(pinCode).digest("hex");

    const challengeToken = `aura_challenge_${crypto.randomBytes(24).toString("hex")}`;
    const challengeTokenHash = crypto.createHash("sha256").update(challengeToken).digest("hex");

    // 3. Persist single-use challenge in exam_proctoring_challenges
    await queryDb(
      `
      INSERT INTO exam_proctoring_challenges (
        tenant_id, attempt_id, student_id,
        challenge_token, challenge_token_hash,
        pin_code, pin_code_hash,
        expires_at, failed_attempts, max_attempts, authenticated_pairing
      ) VALUES (
        $1, $2, $3,
        $4, $5,
        $6, $7,
        CURRENT_TIMESTAMP + ($8 || ' seconds')::interval,
        0, 5, true
      )
      `,
      [
        tenantId,
        attemptId,
        studentId,
        challengeToken,
        challengeTokenHash,
        pinCode,
        pinCodeHash,
        ttlSeconds.toString(),
      ]
    );

    const origin = req.nextUrl.origin || "http://localhost:3000";
    const companionCliCommand = `python3 scripts/launch_proctor_companion.py --pin "${pinCode}" --server "${origin}" --attemptId "${attemptId}" --autoConnect`;
    const deepLinkUri = `aura-proctor://pair?server=${encodeURIComponent(origin)}&attemptId=${encodeURIComponent(attemptId)}&pin=${encodeURIComponent(pinCode)}`;
    const webCompanionUrl = `http://127.0.0.1:4200/desktop-app/renderer.html?pin=${encodeURIComponent(pinCode)}&attemptId=${encodeURIComponent(attemptId)}&server=${encodeURIComponent(origin)}&autoConnect=true`;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    logEvent("info", "Proctor pairing PIN generated", {
      tenantId,
      attemptId,
      studentId,
      ttlSeconds,
    });

    return jsonWithCors({
      success: true,
      pinCode,
      pairingCode: pinCode,
      challengeToken,
      attemptId,
      studentName,
      studentUsn,
      examTitle,
      expiresAt,
      ttlSeconds,
      webCompanionUrl,
      companionCliCommand,
      launchUri: deepLinkUri,
      deepLinkUri,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    logEvent("error", "Error creating proctor pairing", { error: error.message });
    return jsonWithCors({ error: error.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const attemptId = searchParams.get("attemptId");

    if (!attemptId) {
      return jsonWithCors({ error: "attemptId parameter is required" }, { status: 400 });
    }

    const authUser = await resolveAuth(req);
    if (!authUser) return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
    if (!z.string().uuid().safeParse(attemptId).success) return jsonWithCors({ error: "Invalid attempt" }, { status: 400 });
    if (!["STUDENT", "COE_ADMIN", "SYSTEM_ADMIN", "INVIGILATOR"].includes(authUser.role)) {
      return jsonWithCors({ error: "Forbidden" }, { status: 403 });
    }
    // Query proctoring session status
    const sessionRes = await queryDb(
      `
      SELECT 
        eps.id, eps.tenant_id, eps.attempt_id, eps.student_id,
        eps.status, eps.companion_version, eps.companion_os,
        eps.last_heartbeat_at, eps.identity_status, eps.created_at, eps.updated_at,
        COALESCE(inc.hard_count, 0) as hard_incidents_count,
        COALESCE(inc.total_count, 0) as total_incidents_count
      FROM exam_proctoring_sessions eps
      LEFT JOIN (
        SELECT 
          attempt_id,
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE severity IN ('HIGH', 'CRITICAL')) as hard_count
        FROM exam_proctoring_incidents
        GROUP BY attempt_id
      ) inc ON inc.attempt_id = eps.attempt_id
      JOIN exam_attempts ea ON ea.id = eps.attempt_id AND ea.tenant_id = eps.tenant_id
      WHERE eps.attempt_id = $1 AND ea.tenant_id = $2 AND ($3::uuid IS NULL OR ea.student_id = $3)
      LIMIT 1
      `,
      [attemptId, authUser.tenantId, authUser.role === "STUDENT" ? authUser.userId : null]
    );

    const session = sessionRes.rows[0] || null;
    const now = Date.now();
    const lastHbTime = session?.last_heartbeat_at ? new Date(session.last_heartbeat_at).getTime() : 0;
    const heartbeatAgeMs = lastHbTime > 0 ? (now - lastHbTime) : null;
    const isHeartbeatFresh = heartbeatAgeMs !== null && heartbeatAgeMs <= 15000;

    const isPaired = !!session &&
      session.status !== "IDLE" &&
      session.status !== "TERMINATED" &&
      session.status !== "CLOSED";

    // Dynamic state computation: if heartbeat is stale (> 15s) and exam is in progress, mark DISCONNECTED
    let effectiveStatus = session?.status || "WAITING_FOR_COMPANION";
    if (session && isPaired && !isHeartbeatFresh && session.status !== "SUBMITTED" && session.status !== "CLOSED") {
      effectiveStatus = "DISCONNECTED";
    }

    return jsonWithCors({
      success: true,
      attemptId,
      isPaired,
      isHeartbeatFresh,
      heartbeatAgeMs,
      sessionStatus: effectiveStatus,
      rawStatus: session?.status || null,
      session: session ? {
        ...session,
        effectiveStatus,
        isHeartbeatFresh,
        heartbeatAgeMs,
      } : null,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    return jsonWithCors({ error: error.message }, { status: 500 });
  }
}
