import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "../../../../lib/db";
import { logEvent } from "../../../../lib/logger";
import { executeAutoFinalization } from "../../../../lib/proctoring/proctorAuthorization";

export const dynamic = "force-dynamic";

/**
 * POST /api/proctor/reaper
 *
 * Heartbeat lease sweeper endpoint.
 * Discovers and terminates orphaned/abandoned proctoring sessions where candidate
 * killed companion process, pulled network cable, or experienced browser/system crash.
 *
 * Threshold: > 15 seconds without heartbeat lease renewal.
 */
export async function POST(req: NextRequest) {
  // Authenticate Reaper Request
  const expectedSecret = process.env.AURA_REAPER_SECRET || "aura_internal_reaper_secret_2026";
  const reaperKey = req.headers.get("x-reaper-key");
  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  const isLoopback = req.headers.get("host")?.startsWith("127.0.0.1") || req.headers.get("host")?.startsWith("localhost");

  const isAuthorized = (reaperKey === expectedSecret) || (bearerToken === expectedSecret) || isLoopback;
  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized: Invalid reaper credentials" }, { status: 401 });
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    // 1. Find all candidate stale sessions
    const staleRes = await client.query(`
      SELECT 
        ps.id as session_id,
        ps.tenant_id,
        ps.attempt_id,
        ps.last_heartbeat_at,
        ps.status as proctor_status,
        ea.student_id as attempt_user_id,
        ea.status as attempt_status,
        EXTRACT(EPOCH FROM (clock_timestamp() - ps.last_heartbeat_at)) as stale_seconds
      FROM exam_proctoring_sessions ps
      JOIN exam_attempts ea ON ea.id = ps.attempt_id AND ea.tenant_id = ps.tenant_id
      WHERE ps.status IN ('PROCTOR_READY', 'IN_EXAM', 'MONITORING', 'READY')
        AND ea.status = 'IN_PROGRESS'
        AND ps.last_heartbeat_at IS NOT NULL
        AND ps.last_heartbeat_at < clock_timestamp() - interval '15 seconds'
      LIMIT 25
    `);

    const finalizedList: any[] = [];

    for (const row of staleRes.rows) {
      try {
        await client.query("BEGIN");
        await executeAutoFinalization(client, {
          tenantId: row.tenant_id,
          attemptId: row.attempt_id,
          studentUserId: row.attempt_user_id,
          reasonCode: "PROCTOR_HEARTBEAT_TIMEOUT",
          details: `Heartbeat lease expired: ${parseFloat(row.stale_seconds || "0").toFixed(1)}s elapsed without ping (>15s lease).`,
          action: "SUBMIT",
        });
        await client.query("COMMIT");
        finalizedList.push({
          attemptId: row.attempt_id,
          sessionId: row.session_id,
          staleSeconds: parseFloat(row.stale_seconds || "0"),
        });
      } catch (subErr: any) {
        await client.query("ROLLBACK");
        logEvent("error", "Failed to auto-finalize stale attempt in reaper", {
          attemptId: row.attempt_id,
          error: subErr.message,
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      reapedCount: finalizedList.length,
      finalizedAttempts: finalizedList,
    });
  } catch (err: any) {
    logEvent("error", "Error in proctor heartbeat reaper", { error: err.message });
    return NextResponse.json({ error: err.message }, { status: 500 });
  } finally {
    client.release();
  }
}

export async function GET(req: NextRequest) {
  return POST(req);
}
