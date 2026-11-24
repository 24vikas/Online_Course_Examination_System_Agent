/**
 * apps/web/src/lib/proctoring/proctorAuthorization.ts
 *
 * AURA AUTHORITATIVE SERVER-SIDE PROCTOR AUTHORIZATION CONTRACT
 *
 * Non-negotiable security boundary for all examination actions:
 * - Standard Examination Routes (Exam Start, Autosave, Submission)
 * - OpenAI Codex Coding Exam Execution Routes (/api/coding/execute, /api/coding/submit)
 *
 * Enforces:
 * 1. STRICT_COMPANION_REQUIRED = true
 * 2. PROCTOR_DISCONNECT_ACTION = STRICT_AUTO_FINALIZE
 * 3. 15-second Heartbeat Lease Window
 * 4. Immutable Audit Trail & Immediate Disconnect Finalization
 */

import crypto from "crypto";
import { getDbPool, queryDb } from "../db.ts";
import { resolveAuth, type AuthenticatedUser } from "../auth.ts";
import { logEvent } from "../logger.ts";

export type CodingAction = "read" | "autosave" | "run" | "submit";

export type ProctorAction =
  | "EXAM_START"
  | "AUTOSAVE"
  | "SUBMIT"
  | "CODE_EXECUTE"
  | "CODE_SUBMIT"
  | "GATE_CHECK"
  | "read"
  | "autosave"
  | "run"
  | "submit";

export function normalizeProctorAction(
  action: ProctorAction
): "EXAM_START" | "AUTOSAVE" | "SUBMIT" | "CODE_EXECUTE" | "CODE_SUBMIT" | "GATE_CHECK" {
  switch (action) {
    case "run":
      return "CODE_EXECUTE";
    case "submit":
      return "CODE_SUBMIT";
    case "autosave":
      return "AUTOSAVE";
    case "read":
      return "GATE_CHECK";
    default:
      return action;
  }
}

export interface ProctorAuthContext {
  userId: string;
  tenantId: string;
  role: string;
  membershipId?: string;
  email?: string;
}

export type AuthContextInput =
  | Request
  | AuthenticatedUser
  | ProctorAuthContext
  | { user: ProctorAuthContext }
  | { authUser: ProctorAuthContext }
  | { session: ProctorAuthContext };

export interface ProctorValidationResult {
  allowed: boolean;
  attemptId: string;
  scheduleId: string;
  studentId: string;
  tenantId: string;
  companionSessionId?: string;
  companionStatus?: string;
  lastHeartbeatAgeSeconds?: number;
  reason?: string;
  statusCode: number;
}

export class AuraProctorAuthorizationError extends Error {
  public statusCode: number;
  public code: string;
  public reason: string;
  public attemptId: string;
  public details?: Record<string, unknown>;

  constructor(params: {
    message: string;
    statusCode: number;
    code: string;
    reason: string;
    attemptId: string;
    details?: Record<string, unknown>;
  }) {
    super(params.message);
    this.name = "AuraProctorAuthorizationError";
    this.statusCode = params.statusCode;
    this.code = params.code;
    this.reason = params.reason;
    this.attemptId = params.attemptId;
    this.details = params.details;
  }
}

/**
 * Normalizes varied caller session representations into a verified ProctorAuthContext.
 */
export async function normalizeAuthContext(input: AuthContextInput): Promise<ProctorAuthContext | null> {
  if (!input) return null;

  // If a Request / NextRequest was passed, resolve via session cookie
  if (typeof (input as Request).headers?.get === "function") {
    const user = await resolveAuth(input as Request);
    if (!user) return null;
    return {
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      membershipId: user.membershipId,
      email: user.email,
    };
  }

  // Nested user / session object
  const anyInput = input as any;
  const raw = anyInput.user || anyInput.authUser || anyInput.session || anyInput;

  if (raw && typeof raw.userId === "string") {
    return {
      userId: raw.userId,
      tenantId: raw.tenantId || "dddddddd-dddd-dddd-dddd-dddddddddddd",
      role: raw.role || "STUDENT",
      membershipId: raw.membershipId,
      email: raw.email,
    };
  }

  return null;
}

/**
 * Authoritatively auto-finalizes an exam attempt when proctor companion is disconnected,
 * gracefully exited, killed, or heartbeat lease has expired.
 */
export async function executeAutoFinalization(
  dbClient: any,
  params: {
    tenantId: string;
    attemptId: string;
    studentUserId: string;
    reasonCode: "PROCTOR_COMPANION_TERMINATED" | "PROCTOR_HEARTBEAT_TIMEOUT" | "PROCTOR_DISCONNECT_VOLUNTARY";
    details: string;
    action: ProctorAction;
  }
): Promise<void> {
  const { tenantId, attemptId, studentUserId, reasonCode, details, action } = params;
  const nowIso = new Date().toISOString();

  // 1. Terminate proctoring session
  await dbClient.query(
    `
    UPDATE exam_proctoring_sessions
    SET status = 'TERMINATED',
        updated_at = NOW()
    WHERE attempt_id = $1 AND tenant_id = $2
    `,
    [attemptId, tenantId]
  );

  // 2. Authoritatively seal exam attempt and record provenance in moderation notes
  await dbClient.query(
    `
    UPDATE exam_attempts
    SET status = 'SUBMITTED',
        submitted_at = COALESCE(submitted_at, NOW()),
        moderation_notes = CASE 
          WHEN moderation_notes IS NULL OR moderation_notes = '' THEN $3
          ELSE moderation_notes || ' | ' || $3
        END,
        updated_at = NOW()
    WHERE id = $1 AND tenant_id = $2 AND status = 'IN_PROGRESS'
    `,
    [attemptId, tenantId, `INTERRUPTED: ${reasonCode} - ${details}`]
  );

  // 3. Insert critical integrity signal for Invigilator / COE review
  await dbClient.query(
    `
    INSERT INTO attempt_integrity_signals (
      tenant_id, attempt_id, signal_type, metadata, review_status
    ) VALUES (
      $1, $2, $3, $4, 'PENDING_REVIEW'
    )
    `,
    [
      tenantId,
      attemptId,
      reasonCode,
      JSON.stringify({
        reason: reasonCode,
        details,
        actionTriggered: action,
        terminatedAt: nowIso,
        policyEnforced: "STRICT_AUTO_FINALIZE",
      }),
    ]
  );

  // 4. Insert critical proctoring incident for real-time dashboard notification
  await dbClient.query(
    `
    INSERT INTO exam_proctoring_incidents (
      tenant_id, attempt_id, incident_type, severity, confidence_score, evidence
    ) VALUES (
      $1, $2, 'CAMERA_DISCONNECTED', 'CRITICAL', 1.0, $3
    )
    `,
    [
      tenantId,
      attemptId,
      JSON.stringify({
        reason: reasonCode,
        details,
        source: "assertProctoredAttemptActive",
        action,
        timestamp: nowIso,
      }),
    ]
  );

  // 5. Append immutable audit event
  await dbClient.query(
    `
    INSERT INTO audit_events (
      id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at
    ) VALUES (
      $1, $2, $3, 'ATTEMPT_AUTO_FINALIZED_ON_DISCONNECT', 'EXAM_ATTEMPT', $4, $5, NOW()
    )
    `,
    [
      crypto.randomUUID(),
      tenantId,
      studentUserId,
      attemptId,
      JSON.stringify({
        reason: reasonCode,
        details,
        action,
        finalizedAt: nowIso,
      }),
    ]
  );

  logEvent("warn", "Exam attempt auto-finalized due to proctor disconnect/heartbeat timeout", {
    tenantId,
    attemptId,
    studentUserId,
    reasonCode,
    action,
  });
}

/**
 * Shared central assertion function called before processing any exam action:
 * - Student Start Exam
 * - Student Autosave
 * - Student Exam Submit
 * - Codex Coding Runner Execute (/api/coding/execute)
 * - Codex Coding Runner Submit (/api/coding/submit)
 *
 * Throws AuraProctorAuthorizationError with HTTP statusCode if rejected.
 */
export async function assertProctoredAttemptActive(
  sessionInput: AuthContextInput,
  attemptId: string,
  action: ProctorAction
): Promise<ProctorValidationResult> {
  const result = await checkProctoredAttemptActive(sessionInput, attemptId, action);
  if (!result.allowed) {
    throw new AuraProctorAuthorizationError({
      message: result.reason || "Proctor authorization check failed",
      statusCode: result.statusCode,
      code: result.reason || "PROCTOR_AUTHORIZATION_DENIED",
      reason: result.reason || "Proctor authorization denied",
      attemptId,
      details: {
        action,
        statusCode: result.statusCode,
        companionStatus: result.companionStatus,
        lastHeartbeatAgeSeconds: result.lastHeartbeatAgeSeconds,
      },
    });
  }
  return result;
}

/**
 * Non-throwing variant returning a structured validation result.
 */
export async function checkProctoredAttemptActive(
  sessionInput: AuthContextInput,
  attemptId: string,
  action: ProctorAction
): Promise<ProctorValidationResult> {
  const normAction = normalizeProctorAction(action);
  const authContext = await normalizeAuthContext(sessionInput);
  if (!authContext) {
    return {
      allowed: false,
      attemptId,
      scheduleId: "",
      studentId: "",
      tenantId: "",
      statusCode: 401,
      reason: "UNAUTHORIZED_SESSION",
    };
  }

  if (!attemptId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(attemptId)) {
    return {
      allowed: false,
      attemptId,
      scheduleId: "",
      studentId: authContext.userId,
      tenantId: authContext.tenantId,
      statusCode: 400,
      reason: "INVALID_ATTEMPT_ID",
    };
  }

  const pool = getDbPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // 1. Fetch Attempt with row lock
    const attemptRes = await client.query(
      `
      SELECT 
        ea.id,
        ea.tenant_id,
        ea.exam_schedule_id,
        ea.student_id,
        ea.status,
        ea.server_start_time,
        ea.server_deadline,
        ea.submitted_at,
        ea.server_deadline > clock_timestamp() AS within_deadline
      FROM exam_attempts ea
      WHERE ea.id = $1 AND ea.tenant_id = $2
      FOR UPDATE
      `,
      [attemptId, authContext.tenantId]
    );

    if (attemptRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return {
        allowed: false,
        attemptId,
        scheduleId: "",
        studentId: authContext.userId,
        tenantId: authContext.tenantId,
        statusCode: 404,
        reason: "ATTEMPT_NOT_FOUND",
      };
    }

    const attempt = attemptRes.rows[0];

    // Verify student ownership if caller is STUDENT
    if (authContext.role === "STUDENT" && attempt.student_id !== authContext.userId) {
      await client.query("ROLLBACK");
      return {
        allowed: false,
        attemptId,
        scheduleId: attempt.exam_schedule_id,
        studentId: attempt.student_id,
        tenantId: attempt.tenant_id,
        statusCode: 403,
        reason: "FORBIDDEN_ATTEMPT_OWNERSHIP",
      };
    }

    // 2. Verify Attempt is still IN_PROGRESS
    if (attempt.status !== "IN_PROGRESS" || attempt.submitted_at !== null) {
      await client.query("ROLLBACK");
      return {
        allowed: false,
        attemptId,
        scheduleId: attempt.exam_schedule_id,
        studentId: attempt.student_id,
        tenantId: attempt.tenant_id,
        statusCode: 409,
        reason: "ATTEMPT_ALREADY_SUBMITTED_OR_FINALIZED",
      };
    }

    // 3. Verify Server Deadline
    if (!attempt.within_deadline) {
      // Auto-finalize on deadline expiry
      await client.query(
        `
        UPDATE exam_attempts
        SET status = 'EXPIRED',
            submitted_at = COALESCE(submitted_at, NOW()),
            updated_at = NOW()
        WHERE id = $1
        `,
        [attemptId]
      );
      await client.query("COMMIT");
      return {
        allowed: false,
        attemptId,
        scheduleId: attempt.exam_schedule_id,
        studentId: attempt.student_id,
        tenantId: attempt.tenant_id,
        statusCode: 410,
        reason: "EXAM_DEADLINE_EXPIRED",
      };
    }

    // 4. Check Proctoring Policy (STRICT_COMPANION_REQUIRED)
    // Default: true for all institutional exams
    const strictCompanionRequired = true;
    const strictAutoFinalize = true;

    if (!strictCompanionRequired) {
      await client.query("COMMIT");
      return {
        allowed: true,
        attemptId,
        scheduleId: attempt.exam_schedule_id,
        studentId: attempt.student_id,
        tenantId: attempt.tenant_id,
        statusCode: 200,
      };
    }

    // 5. Query Proctoring Session for this Attempt
    const sessionRes = await client.query(
      `
      SELECT 
        ps.id,
        ps.tenant_id,
        ps.attempt_id,
        ps.student_id,
        ps.status,
        ps.last_heartbeat_at,
        ps.telemetry_expires_at,
        EXTRACT(EPOCH FROM (clock_timestamp() - ps.last_heartbeat_at)) as heartbeat_age_seconds
      FROM exam_proctoring_sessions ps
      WHERE ps.attempt_id = $1 AND ps.tenant_id = $2
      FOR UPDATE
      `,
      [attemptId, authContext.tenantId]
    );

    if (sessionRes.rows.length === 0) {
      await client.query("ROLLBACK");
      return {
        allowed: false,
        attemptId,
        scheduleId: attempt.exam_schedule_id,
        studentId: attempt.student_id,
        tenantId: attempt.tenant_id,
        statusCode: 403,
        reason: "COMPANION_NOT_PAIRED",
      };
    }

    const proctorSession = sessionRes.rows[0];
    const heartbeatAge = proctorSession.heartbeat_age_seconds != null
      ? parseFloat(proctorSession.heartbeat_age_seconds)
      : 999999;

    // 6. Check Companion Status: Must not be TERMINATED or CLOSED
    if (["TERMINATED", "CLOSED", "DISCONNECTED"].includes(proctorSession.status)) {
      if (strictAutoFinalize && attempt.status === "IN_PROGRESS") {
        await executeAutoFinalization(client, {
          tenantId: attempt.tenant_id,
          attemptId: attempt.id,
          studentUserId: attempt.student_id,
          reasonCode: "PROCTOR_COMPANION_TERMINATED",
          details: `Companion session is ${proctorSession.status}. Action '${action}' rejected and attempt finalized.`,
          action,
        });
      }
      await client.query("COMMIT");
      return {
        allowed: false,
        attemptId,
        scheduleId: attempt.exam_schedule_id,
        studentId: attempt.student_id,
        tenantId: attempt.tenant_id,
        companionSessionId: proctorSession.id,
        companionStatus: proctorSession.status,
        statusCode: 403,
        reason: "PROCTOR_COMPANION_TERMINATED",
      };
    }

    // 7. Check Heartbeat Lease Window (15 Seconds Threshold)
    const MAX_HEARTBEAT_LEASE_SECONDS = 15;

    // For GATE_CHECK or EXAM_START, allow PROCTOR_READY state if paired within last 60 seconds
    const isInitialStart = (normAction === "EXAM_START" || normAction === "GATE_CHECK") &&
      proctorSession.status === "PROCTOR_READY" &&
      (proctorSession.last_heartbeat_at === null || heartbeatAge <= 60);

    if (!isInitialStart && (proctorSession.last_heartbeat_at === null || heartbeatAge > MAX_HEARTBEAT_LEASE_SECONDS)) {
      // Heartbeat lease has expired!
      if (strictAutoFinalize) {
        await executeAutoFinalization(client, {
          tenantId: attempt.tenant_id,
          attemptId: attempt.id,
          studentUserId: attempt.student_id,
          reasonCode: "PROCTOR_HEARTBEAT_TIMEOUT",
          details: `Proctor companion heartbeat timed out (${heartbeatAge.toFixed(1)}s elapsed > ${MAX_HEARTBEAT_LEASE_SECONDS}s lease). Action '${normAction}' blocked.`,
          action: normAction,
        });
      }
      await client.query("COMMIT");
      return {
        allowed: false,
        attemptId,
        scheduleId: attempt.exam_schedule_id,
        studentId: attempt.student_id,
        tenantId: attempt.tenant_id,
        companionSessionId: proctorSession.id,
        companionStatus: proctorSession.status,
        lastHeartbeatAgeSeconds: heartbeatAge,
        statusCode: 403,
        reason: "PROCTOR_HEARTBEAT_TIMEOUT",
      };
    }

    // 8. If state is PROCTOR_READY, transition to IN_EXAM on first active exam action
    if (proctorSession.status === "PROCTOR_READY" && (normAction === "EXAM_START" || normAction === "AUTOSAVE" || normAction === "CODE_EXECUTE" || normAction === "CODE_SUBMIT")) {
      await client.query(
        `
        UPDATE exam_proctoring_sessions
        SET status = 'IN_EXAM',
            updated_at = NOW()
        WHERE id = $1
        `,
        [proctorSession.id]
      );
      proctorSession.status = "IN_EXAM";
    }

    await client.query("COMMIT");

    return {
      allowed: true,
      attemptId,
      scheduleId: attempt.exam_schedule_id,
      studentId: attempt.student_id,
      tenantId: attempt.tenant_id,
      companionSessionId: proctorSession.id,
      companionStatus: proctorSession.status,
      lastHeartbeatAgeSeconds: heartbeatAge,
      statusCode: 200,
    };
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Shared Proctored Attempt Guard interface for Codex Coding Examination integration.
 */
export interface ProctoredAttemptAuthorization {
  userId: string;
  tenantId: string;
  attemptId: string;
  scheduleId: string;
}

export type ProctoredAttemptGuard = (
  request: Request,
  attemptId: string,
  action: CodingAction | ProctorAction
) => Promise<ProctoredAttemptAuthorization>;

export const requireProctoredCodingAttempt: ProctoredAttemptGuard = async (
  request: Request,
  attemptId: string,
  action: CodingAction | ProctorAction
): Promise<ProctoredAttemptAuthorization> => {
  const normAction = normalizeProctorAction(action);
  const result = await assertProctoredAttemptActive(request, attemptId, normAction);
  return {
    userId: result.studentId,
    tenantId: result.tenantId,
    attemptId: result.attemptId,
    scheduleId: result.scheduleId,
  };
};
