import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { logEvent } from "../../../../../lib/logger";
import { DEMO_CONFIG } from "../../../../../lib/constants";
import { handleCorsPreflight, jsonWithCors } from "../../../../../lib/cors";
import crypto from "crypto";
import { checkRateLimitAndConcurrency, releaseConcurrency } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return handleCorsPreflight();
}

function sanitizeTenantId(id: string | null | undefined): string {
  if (id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return id;
  }
  return DEMO_CONFIG.productionTenantId;
}

export async function POST(req: NextRequest) {
  const limitKey = "companion-pairing-exchange";
  const limit = checkRateLimitAndConcurrency(limitKey, { capacity: 25, refillRatePerSec: 1, maxConcurrent: 8 });
  if (!limit.allowed) return limit.errorResponse!;
  try {
    const body = await req.json().catch(() => ({}));
    const rawPin = body.pin ? String(body.pin).trim() : "";
    const clientVersion = typeof body.clientVersion === "string" ? body.clientVersion.slice(0, 64) : "1.0.0";
    const clientOs = typeof body.os === "string" ? body.os.slice(0, 64) : "unknown";
    const companionId = typeof body.companionId === "string" ? body.companionId.slice(0, 64) : "companion-standalone";

    if (!/^\d{8}$/.test(rawPin)) {
      return jsonWithCors(
        { success: false, error: "MISSING_PIN", message: "Pairing PIN is required." },
        { status: 400 }
      );
    }

    const pinHash = crypto.createHash("sha256").update(rawPin).digest("hex");

    // 1. Lookup matching challenge in exam_proctoring_challenges
    const challengeRes = await queryDb(
      `
      SELECT 
        c.id, c.tenant_id, c.attempt_id, c.student_id,
        c.expires_at, c.consumed_at, c.failed_attempts, c.max_attempts
      FROM exam_proctoring_challenges c
      WHERE c.authenticated_pairing AND c.pin_code_hash = $1
      ORDER BY c.created_at DESC
      LIMIT 1
      `,
      [pinHash]
    );

    if (challengeRes.rows.length === 0) {
      logEvent("warn", "Proctor PIN exchange failed: Invalid PIN", { pinLength: rawPin.length });
      return jsonWithCors(
        {
          success: false,
          error: "INVALID_PIN",
          message: "Pairing PIN not recognized. Check the 8-digit PIN displayed on your exam screen.",
        },
        { status: 404 }
      );
    }

    const challenge = challengeRes.rows[0];
    if (body.attemptId && body.attemptId !== challenge.attempt_id) {
      return jsonWithCors({ error: "Pairing unavailable" }, { status: 403 });
    }

    // 2. Anti-Replay Defense: Check if challenge was already consumed
    if (challenge.consumed_at) {
      logEvent("warn", "Proctor PIN exchange failed: Replay attack detected", {
        challengeId: challenge.id,
        attemptId: challenge.attempt_id,
        consumedAt: challenge.consumed_at,
      });
      return jsonWithCors(
        {
          success: false,
          error: "PIN_ALREADY_USED",
          message: "This one-time pairing PIN has already been consumed. Anti-replay violation.",
        },
        { status: 409 }
      );
    }

    // 3. TTL Expiration Defense
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      logEvent("warn", "Proctor PIN exchange failed: PIN expired", {
        challengeId: challenge.id,
        attemptId: challenge.attempt_id,
        expiresAt: challenge.expires_at,
      });
      return jsonWithCors(
        {
          success: false,
          error: "PIN_EXPIRED",
          message: "Pairing PIN has expired. Please refresh the exam page to generate a fresh PIN.",
        },
        { status: 410 }
      );
    }

    // 4. Rate-limiting / Failed attempt defense
    if (challenge.failed_attempts >= challenge.max_attempts) {
      return jsonWithCors(
        {
          success: false,
          error: "MAX_ATTEMPTS_EXCEEDED",
          message: "Too many failed attempts. This PIN is locked.",
        },
        { status: 429 }
      );
    }

    const tenantId = sanitizeTenantId(challenge.tenant_id);
    const attemptId = challenge.attempt_id;
    const studentId = challenge.student_id;

    // 5. Atomically consume the single-use challenge
    const consumed = await queryDb(
      `
      UPDATE exam_proctoring_challenges
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp()
      `,
      [challenge.id]
    );

    if (!consumed.rowCount) return jsonWithCors({ error: "Pairing unavailable" }, { status: 409 });

    // 6. Generate high-entropy session token bound to this attempt
    const sessionToken = `aura_ct_${crypto.randomBytes(32).toString("hex")}`;
    const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");

    // 7. Upsert proctoring session in PostgreSQL with status = 'PROCTOR_READY'
    const sessionRes = await queryDb(
      `
      INSERT INTO exam_proctoring_sessions (
        tenant_id, attempt_id, student_id,
        companion_version, companion_os,
        session_token_hash, status, identity_status,
        last_heartbeat_at, updated_at, telemetry_expires_at
      )
      SELECT $1, ea.id, $3, $4, $5, $6, 'PROCTOR_READY', 'VERIFIED',
             NULL, CURRENT_TIMESTAMP, LEAST(ea.server_deadline, CURRENT_TIMESTAMP + INTERVAL '4 hours')
      FROM exam_attempts ea
      WHERE ea.id = $2 AND ea.tenant_id = $1 AND ea.status = 'IN_PROGRESS'
        AND ea.submitted_at IS NULL AND ea.server_deadline > CURRENT_TIMESTAMP
      ON CONFLICT (attempt_id)
      DO UPDATE SET
        companion_version = EXCLUDED.companion_version,
        companion_os = EXCLUDED.companion_os,
        session_token_hash = EXCLUDED.session_token_hash,
        status = 'PROCTOR_READY',
        identity_status = 'VERIFIED',
        last_heartbeat_at = NULL,
        telemetry_expires_at = EXCLUDED.telemetry_expires_at,
        updated_at = CURRENT_TIMESTAMP
      WHERE exam_proctoring_sessions.tenant_id = EXCLUDED.tenant_id
        AND exam_proctoring_sessions.student_id = EXCLUDED.student_id
        AND exam_proctoring_sessions.status NOT IN ('SUBMITTED', 'TERMINATED')
      RETURNING id, status
      `,
      [tenantId, attemptId, studentId, clientVersion, clientOs, sessionTokenHash]
    );

    if (!sessionRes.rowCount) return jsonWithCors({ error: "Pairing unavailable" }, { status: 409 });
    const sessionId = sessionRes.rows[0].id;

    // 8. Fetch candidate context for companion display
    const metaRes = await queryDb(
      `
      SELECT 
        ea.student_id AS user_id,
        s.institutional_student_id as usn,
        COALESCE(TRIM(s.first_name || ' ' || COALESCE(s.last_name, '')), s.email, 'Candidate') as student_name,
        es.title as exam_title,
        mc.course_code
      FROM exam_attempts ea
      JOIN students s ON s.id = $2 AND s.tenant_id = ea.tenant_id
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE ea.id = $1
      LIMIT 1
      `,
      [attemptId, studentId]
    );

    const studentName = metaRes.rows[0]?.student_name || "Candidate";
    const studentUsn = metaRes.rows[0]?.usn || "DEMO001";
    const examTitle = metaRes.rows[0]?.exam_title || "26ECAC401 — Agentic AI";
    const courseCode = metaRes.rows[0]?.course_code || "26ECAC401";

    // 9. Persist audit trail event
    await queryDb(
      `
      INSERT INTO audit_events (
        id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at
      ) VALUES (
        $1, $2, $3, 'PROCTOR_COMPANION_PAIRED', 'EXAM_ATTEMPT', $4, $5, NOW()
      )
      `,
      [
        crypto.randomUUID(),
        tenantId,
        metaRes.rows[0].user_id,
        attemptId,
        JSON.stringify({
          sessionId,
          companionId,
          clientVersion,
          clientOs,
          pairedAt: new Date().toISOString(),
        }),
      ]
    );

    logEvent("info", "Proctor companion successfully paired", {
      tenantId,
      attemptId,
      studentId,
      studentUsn,
      sessionId,
    });

    return jsonWithCors({
      success: true,
      sessionId,
      sessionToken,
      attemptId,
      studentId,
      studentName,
      studentUsn,
      examTitle,
      courseCode,
      tenantId,
      status: "PROCTOR_READY",
      heartbeatIntervalSeconds: 5,
      staleThresholdSeconds: 15,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    logEvent("error", "Error during proctor pairing exchange", { error: error.message });
    return jsonWithCors({ error: "Pairing unavailable" }, { status: 500 });
  } finally {
    releaseConcurrency(limitKey);
  }
}
