import { createHash } from "crypto";
import { NextRequest } from "next/server";
import { getDbPool } from "../../../../../lib/db";
import { logEvent } from "../../../../../lib/logger";
import { handleCorsPreflight, jsonWithCors } from "../../../../../lib/cors";
import { executeAutoFinalization } from "../../../../../lib/proctoring/proctorAuthorization";

export const dynamic = "force-dynamic";
export const OPTIONS = handleCorsPreflight;

/**
 * POST /api/proctor/session/shutdown
 *
 * Dedicated graceful termination endpoint called by the Native Linux Companion
 * when candidate stops monitoring, closes the companion window, or exits.
 *
 * Authenticated via Bearer aura_ct_<token>.
 * Atomically marks proctoring session as TERMINATED, seals the exam attempt,
 * and notifies Invigilator and COE through SSE and integrity signals.
 */
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonWithCors({ error: "Unauthorized" }, { status: 401 });
  }

  const token = authHeader.slice(7);
  if (!/^aura_ct_[a-f0-9]{64}$/.test(token)) {
    return jsonWithCors({ error: "Invalid companion session token format" }, { status: 401 });
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const body = await req.json().catch(() => ({}));
  const reason = body.reason || "USER_VOLUNTARY_EXIT";
  const details = body.details || "Candidate closed proctor companion application.";

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Lookup matching session
    const sessionRes = await client.query(
      `
      SELECT 
        ps.id,
        ps.tenant_id,
        ps.attempt_id,
        ps.student_id,
        ps.status,
        ea.student_id as attempt_user_id,
        ea.status as attempt_status
      FROM exam_proctoring_sessions ps
      JOIN exam_attempts ea ON ea.id = ps.attempt_id AND ea.tenant_id = ps.tenant_id
      WHERE ps.session_token_hash = $1
      FOR UPDATE
      `,
      [tokenHash]
    );

    if (sessionRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return jsonWithCors({ error: "Companion session not found" }, { status: 404 });
    }

    const session = sessionRes.rows[0];

    // Anti-Forgery check: If caller provides attemptId or studentId, verify ownership matches token session
    if (body.attemptId && body.attemptId !== session.attempt_id) {
      await client.query("ROLLBACK");
      logEvent("warn", "Attempt ID mismatch in companion shutdown (possible forgery)", {
        sessionAttempt: session.attempt_id,
        requestedAttempt: body.attemptId,
      });
      return jsonWithCors({ error: "Forbidden: Attempt ID mismatch" }, { status: 403 });
    }

    if (body.studentId && body.studentId !== session.student_id && body.studentId !== session.attempt_user_id) {
      await client.query("ROLLBACK");
      logEvent("warn", "Student ID mismatch in companion shutdown (possible forgery)", {
        sessionStudent: session.student_id,
        requestedStudent: body.studentId,
      });
      return jsonWithCors({ error: "Forbidden: Student ID mismatch" }, { status: 403 });
    }

    // Idempotency: If already terminated, return success without re-executing
    if (session.status === "TERMINATED" || session.attempt_status !== "IN_PROGRESS") {
      await client.query("COMMIT");
      return jsonWithCors({
        success: true,
        status: "TERMINATED",
        attemptId: session.attempt_id,
        attemptFinalized: true,
        idempotent: true,
        message: "Proctor session already terminated. Examination attempt sealed.",
        serverTime: new Date().toISOString(),
      });
    }

    // Authoritatively auto-finalize the attempt and session
    await executeAutoFinalization(client, {
      tenantId: session.tenant_id,
      attemptId: session.attempt_id,
      studentUserId: session.attempt_user_id,
      reasonCode: "PROCTOR_COMPANION_TERMINATED",
      details: `Proctor companion shutdown received: ${reason}. ${details}`,
      action: "SUBMIT",
    });

    await client.query("COMMIT");

    logEvent("info", "Proctor companion session gracefully terminated and attempt auto-finalized", {
      sessionId: session.id,
      attemptId: session.attempt_id,
      reason,
    });

    return jsonWithCors({
      success: true,
      status: "TERMINATED",
      attemptId: session.attempt_id,
      attemptFinalized: true,
      message: "Proctor session terminated. Examination attempt sealed.",
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    logEvent("error", "Error shutting down proctor session", { error: error.message });
    return jsonWithCors({ error: error.message || "Failed to terminate session" }, { status: 500 });
  } finally {
    client.release();
  }
}
