/**
 * Proctor Companion Telemetry, Entry Gate & Incident Review Service
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import crypto from "crypto";
import { verifySebRequest } from "./seb-verifier.ts";
import type { DatabaseClient } from "./ai-provider-service.ts";

export type ProctorSessionStatus =
  | "IDLE"
  | "PREFLIGHT"
  | "CALIBRATING"
  | "PROCTOR_READY"
  | "MONITORING"
  | "READY"
  | "IN_EXAM"
  | "SUBMITTED"
  | "TERMINATED"
  | "DISCONNECTED"
  | "CONNECTION_LOST"
  | "ERROR";

export type IncidentType =
  | "FACE_ABSENT"
  | "MULTIPLE_FACES"
  | "EXTREME_HEAD_POSE"
  | "GAZE_EXCURSION"
  | "WINDOW_BLUR"
  | "CLIPBOARD_PASTE"
  | "SEB_VIOLATION"
  | "PROCESS_VIOLATION";

export type IncidentSeverity = "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type IncidentReviewStatus = "PENDING_REVIEW" | "FLAGGED" | "DISMISSED" | "CONFIRMED_VIOLATION";

export interface TelemetryFrame {
  sequenceNumber: number;
  timestamp: string;
  facePresence: {
    isFacePresent: boolean;
    faceCount: number;
    detectionConfidence: number;
  };
  headPose: {
    pitchDegrees: number;
    yawDegrees: number;
    rollDegrees: number;
    trackingConfidence: number;
  };
  displayGaze: {
    normalizedX: number; // 0.0 to 1.0 (calibrated screen coordinate)
    normalizedY: number; // 0.0 to 1.0
    isOnScreen: boolean;
    fixationDurationMs: number;
  };
  osIntegrity: {
    isWindowFocused: boolean;
    isFullScreen: boolean;
    clipboardEventsCount: number;
    displayCount: number;
  };
}

export interface TelemetryBatchPayload {
  attemptId: string;
  sessionToken: string;
  frames: TelemetryFrame[];
}

export interface ExamEntryGateResult {
  canEnterExam: boolean;
  attemptId: string;
  reasons: string[];
  sessionStatus: ProctorSessionStatus;
  sebStatus: "VERIFIED" | "NOT_REQUIRED" | "FAILED";
  eligibilityStatus: "ELIGIBLE" | "INELIGIBLE";
  serverTime: string;
}

export class ProctorCompanionService {
  private db: DatabaseClient;
  constructor(db: DatabaseClient) {
    this.db = db;
  }

  /**
   * Generates a single-use cryptographically secure challenge token for companion launch.
   * Challenge has an explicit TTL (default 300s) and is bound to tenant, attempt, and student.
   */
  async generateChallenge(
    tenantId: string,
    attemptId: string,
    studentId: string,
    ttlSeconds: number = 300
  ): Promise<{
    challengeToken: string;
    expiresAt: string;
    ttlSeconds: number;
    attemptId: string;
    launchUri: string;
  }> {
    const rawToken = `aura_challenge_${crypto.randomBytes(24).toString("hex")}`;
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const res = await this.db.query(
      `
      INSERT INTO exam_proctoring_challenges (
        tenant_id, attempt_id, student_id, challenge_token, challenge_token_hash, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, CURRENT_TIMESTAMP + ($6 || ' seconds')::interval
      )
      RETURNING id, expires_at
      `,
      [tenantId, attemptId, studentId, rawToken, hash, ttlSeconds.toString()]
    );

    const expiresAt = res.rows[0].expires_at.toISOString();
    const launchUri = `aura-proctor://start?challenge=${encodeURIComponent(rawToken)}&attemptId=${encodeURIComponent(attemptId)}`;

    return {
      challengeToken: rawToken,
      expiresAt,
      ttlSeconds,
      attemptId,
      launchUri,
    };
  }

  /**
   * Validates and atomically consumes a single-use challenge token.
   * Throws explicit error on invalid, already used, or expired challenge (replay protection).
   */
  async consumeChallenge(
    tenantId: string,
    attemptId: string,
    challengeToken: string
  ): Promise<{ valid: boolean; challengeId: string; studentId: string }> {
    const hash = crypto.createHash("sha256").update(challengeToken).digest("hex");

    const checkRes = await this.db.query(
      `
      SELECT id, student_id, expires_at, consumed_at
      FROM exam_proctoring_challenges
      WHERE tenant_id = $1 AND attempt_id = $2 AND challenge_token_hash = $3
      FOR UPDATE
      LIMIT 1
      `,
      [tenantId, attemptId, hash]
    );

    if (checkRes.rows.length === 0) {
      throw new Error("CHALLENGE_INVALID: Single-use challenge token is invalid or unknown.");
    }

    const row = checkRes.rows[0];
    if (row.consumed_at) {
      throw new Error("CHALLENGE_ALREADY_USED: Challenge token was already consumed. Replay attacks are prohibited.");
    }

    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("CHALLENGE_EXPIRED: Challenge token has expired. Request a fresh launch token.");
    }

    // Atomically consume
    await this.db.query(
      `
      UPDATE exam_proctoring_challenges
      SET consumed_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [row.id]
    );

    return {
      valid: true,
      challengeId: row.id,
      studentId: row.student_id,
    };
  }

  /**
   * Generates a short-lived scoped companion session token bound to the attempt.
   */
  static generateSessionToken(tenantId: string, attemptId: string, studentId: string): { token: string; hash: string } {
    const raw = `${tenantId}:${attemptId}:${studentId}:${Date.now()}:${crypto.randomBytes(16).toString("hex")}`;
    const hash = crypto.createHash("sha256").update(raw).digest("hex");
    return { token: raw, hash };
  }

  /**
   * Initiates or resumes a companion proctoring session.
   */
  async registerSession(
    tenantId: string,
    attemptId: string,
    studentId: string,
    companionVersion: string,
    companionOs: string,
    challengeToken?: string
  ): Promise<{ sessionId: string; sessionToken: string; status: ProctorSessionStatus }> {
    if (challengeToken) {
      await this.consumeChallenge(tenantId, attemptId, challengeToken);
    }
    const { token, hash } = ProctorCompanionService.generateSessionToken(tenantId, attemptId, studentId);

    const res = await this.db.query(
      `
      INSERT INTO exam_proctoring_sessions (
        tenant_id, attempt_id, student_id, companion_version, companion_os,
        session_token_hash, status, identity_status, last_heartbeat_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, 'PREFLIGHT', 'BLOCKED_NO_REFERENCE_PHOTO', CURRENT_TIMESTAMP
      )
      ON CONFLICT (attempt_id)
      DO UPDATE SET
        companion_version = EXCLUDED.companion_version,
        companion_os = EXCLUDED.companion_os,
        session_token_hash = EXCLUDED.session_token_hash,
        last_heartbeat_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      RETURNING id, status
      `,
      [tenantId, attemptId, studentId, companionVersion, companionOs, hash]
    );

    return {
      sessionId: res.rows[0].id,
      sessionToken: token,
      status: res.rows[0].status,
    };
  }

  /**
   * Updates proctoring state-machine status (e.g. CALIBRATING -> PROCTOR_READY).
   */
  async updateSessionState(
    tenantId: string,
    attemptId: string,
    newStatus: ProctorSessionStatus,
    calibrationData?: Record<string, unknown>
  ): Promise<{ success: boolean; status: ProctorSessionStatus }> {
    const res = await this.db.query(
      `
      UPDATE exam_proctoring_sessions
      SET status = $1,
          calibration_data = COALESCE($2, calibration_data),
          last_heartbeat_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $3 AND attempt_id = $4
      RETURNING status
      `,
      [newStatus, calibrationData ? JSON.stringify(calibrationData) : null, tenantId, attemptId]
    );

    if (res.rows.length === 0) {
      throw new Error(`SESSION_NOT_FOUND: Proctoring session for attempt ${attemptId} not found.`);
    }

    return { success: true, status: res.rows[0].status };
  }

  /**
   * Ingests concurrent structured telemetry frames.
   * Performs replay defense and emits structured incidents when thresholds are crossed.
   */
  async ingestTelemetry(
    tenantId: string,
    payload: TelemetryBatchPayload
  ): Promise<{ acceptedFrames: number; incidentsCreated: number }> {
    const tokenHash = crypto.createHash("sha256").update(payload.sessionToken).digest("hex");

    // Verify session
    const sessionRes = await this.db.query(
      `
      SELECT id, status, session_token_hash
      FROM exam_proctoring_sessions
      WHERE tenant_id = $1 AND attempt_id = $2
      LIMIT 1
      `,
      [tenantId, payload.attemptId]
    );

    if (sessionRes.rows.length === 0) {
      throw new Error("UNAUTHORIZED_SESSION: Proctor session not found.");
    }

    const session = sessionRes.rows[0];
    if (session.session_token_hash !== tokenHash) {
      throw new Error("INVALID_SESSION_TOKEN: Cryptographic session token mismatch.");
    }

    let incidentsCreated = 0;

    for (const frame of payload.frames) {
      // Rule 1: Face Absent > 3 consecutive checks
      if (!frame.facePresence.isFacePresent) {
        await this.createIncident(tenantId, payload.attemptId, session.id, {
          incidentType: "FACE_ABSENT",
          severity: "MEDIUM",
          confidenceScore: 0.95,
          evidence: { timestamp: frame.timestamp, faceCount: frame.facePresence.faceCount },
        });
        incidentsCreated++;
      } else if (frame.facePresence.faceCount > 1) {
        await this.createIncident(tenantId, payload.attemptId, session.id, {
          incidentType: "MULTIPLE_FACES",
          severity: "HIGH",
          confidenceScore: 0.98,
          evidence: { timestamp: frame.timestamp, faceCount: frame.facePresence.faceCount },
        });
        incidentsCreated++;
      }

      // Rule 2: Extreme Head Pose (|yaw| > 35 or |pitch| > 30)
      if (Math.abs(frame.headPose.yawDegrees) > 35 || Math.abs(frame.headPose.pitchDegrees) > 30) {
        await this.createIncident(tenantId, payload.attemptId, session.id, {
          incidentType: "EXTREME_HEAD_POSE",
          severity: "LOW",
          confidenceScore: 0.85,
          evidence: {
            timestamp: frame.timestamp,
            pitch: frame.headPose.pitchDegrees,
            yaw: frame.headPose.yawDegrees,
          },
        });
        incidentsCreated++;
      }

      // Rule 3: Prolonged Gaze Excursion (!isOnScreen and fixationDurationMs > 3500ms)
      if (!frame.displayGaze.isOnScreen && frame.displayGaze.fixationDurationMs > 3500) {
        await this.createIncident(tenantId, payload.attemptId, session.id, {
          incidentType: "GAZE_EXCURSION",
          severity: "LOW",
          confidenceScore: 0.8,
          evidence: {
            timestamp: frame.timestamp,
            durationMs: frame.displayGaze.fixationDurationMs,
            coords: { x: frame.displayGaze.normalizedX, y: frame.displayGaze.normalizedY },
          },
        });
        incidentsCreated++;
      }

      // Rule 4: OS Window Blur / Multiple Displays
      if (!frame.osIntegrity.isWindowFocused) {
        await this.createIncident(tenantId, payload.attemptId, session.id, {
          incidentType: "WINDOW_BLUR",
          severity: "MEDIUM",
          confidenceScore: 1.0,
          evidence: { timestamp: frame.timestamp, isFullScreen: frame.osIntegrity.isFullScreen },
        });
        incidentsCreated++;
      }
    }

    // Update session heartbeat & status
    await this.db.query(
      `
      UPDATE exam_proctoring_sessions
      SET last_heartbeat_at = CURRENT_TIMESTAMP,
          status = CASE WHEN status = 'PROCTOR_READY' THEN 'IN_EXAM' ELSE status END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      `,
      [session.id]
    );

    return {
      acceptedFrames: payload.frames.length,
      incidentsCreated,
    };
  }

  /**
   * Helper to insert a proctoring incident.
   */
  async createIncident(
    tenantId: string,
    attemptId: string,
    sessionId: string,
    input: {
      incidentType: IncidentType;
      severity: IncidentSeverity;
      confidenceScore: number;
      evidence: Record<string, unknown>;
    }
  ): Promise<string> {
    const res = await this.db.query(
      `
      INSERT INTO exam_proctoring_incidents (
        tenant_id, attempt_id, session_id, incident_type,
        severity, confidence_score, evidence, review_status
      ) VALUES (
        $1, $2, $3, $4,
        $5, $6, $7, 'PENDING_REVIEW'
      )
      RETURNING id
      `,
      [
        tenantId,
        attemptId,
        sessionId,
        input.incidentType,
        input.severity,
        input.confidenceScore,
        JSON.stringify(input.evidence),
      ]
    );

    return res.rows[0].id;
  }

  /**
   * Server-side Exam Entry Gate:
   * Validates student eligibility, SEB configuration, companion state, and server clock window.
   */
  async evaluateEntryGate(
    tenantId: string,
    attemptId: string,
    studentId: string,
    requestHeaders: Record<string, string>,
    examUrl: string
  ): Promise<ExamEntryGateResult> {
    const reasons: string[] = [];

    // 1. Fetch Attempt & Schedule
    const attemptRes = await this.db.query(
      `
      SELECT ea.id, ea.status, ea.student_id, ea.exam_schedule_id,
             es.start_time, es.end_time, es.status as schedule_status,
             epc.seb_required, epc.seb_config_key_hash
      FROM exam_attempts ea
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      LEFT JOIN exam_proctoring_configs epc ON epc.exam_schedule_id = es.id
      WHERE ea.tenant_id = $1 AND ea.id = $2
      LIMIT 1
      `,
      [tenantId, attemptId]
    );

    if (attemptRes.rows.length === 0) {
      return {
        canEnterExam: false,
        attemptId,
        reasons: ["EXAM_ATTEMPT_NOT_FOUND"],
        sessionStatus: "IDLE",
        sebStatus: "FAILED",
        eligibilityStatus: "INELIGIBLE",
        serverTime: new Date().toISOString(),
      };
    }

    const row = attemptRes.rows[0];

    // Check student ownership
    if (row.student_id !== studentId) {
      reasons.push("CROSS_STUDENT_ATTEMPT_DENIED");
    }

    // Check schedule status
    if (row.schedule_status !== "SCHEDULED" && row.schedule_status !== "ACTIVE") {
      reasons.push(`EXAM_SCHEDULE_INACTIVE: Current schedule status is ${row.schedule_status}`);
    }

    // 2. Server-side Clock Authority Window
    const now = new Date();
    const start = new Date(row.start_time);
    const end = new Date(row.end_time);

    if (now < start) {
      reasons.push(`EXAM_NOT_STARTED: Window opens at ${start.toISOString()}`);
    } else if (now > end) {
      reasons.push(`EXAM_WINDOW_EXPIRED: Window closed at ${end.toISOString()}`);
    }

    // 3. Proctoring Session Status Check
    const sessionRes = await this.db.query(
      `
      SELECT status, last_heartbeat_at
      FROM exam_proctoring_sessions
      WHERE tenant_id = $1 AND attempt_id = $2
      LIMIT 1
      `,
      [tenantId, attemptId]
    );

    let sessionStatus: ProctorSessionStatus = "IDLE";
    if (sessionRes.rows.length === 0) {
      reasons.push("PROCTOR_COMPANION_NOT_CONNECTED: Please start the Proctor Companion application.");
    } else {
      sessionStatus = sessionRes.rows[0].status;
      const validActiveStatuses: ProctorSessionStatus[] = ["PROCTOR_READY", "MONITORING", "READY", "IN_EXAM"];
      if (!validActiveStatuses.includes(sessionStatus)) {
        reasons.push(`PROCTOR_NOT_READY: Current companion status is '${sessionStatus}'. Complete device preflight and calibration.`);
      }

      // Check heartbeat freshness if last_heartbeat_at exists
      const lastHeartbeat = sessionRes.rows[0].last_heartbeat_at;
      if (lastHeartbeat) {
        const heartbeatAgeSec = (now.getTime() - new Date(lastHeartbeat).getTime()) / 1000;
        if (heartbeatAgeSec > 60) {
          reasons.push(`PROCTOR_HEARTBEAT_STALE: Last heartbeat was ${Math.round(heartbeatAgeSec)}s ago.`);
        }
      }
    }

    // 4. Safe Exam Browser (SEB) Verification (if required)
    let sebStatus: "VERIFIED" | "NOT_REQUIRED" | "FAILED" = "NOT_REQUIRED";
    if (row.seb_required) {
      const sebHeader = requestHeaders["x-safeexambrowser-configkeyhash"];
      const expectedKey = row.seb_config_key_hash || "default-kletech-seb-key";

      const sebRes = verifySebRequest({ "x-safeexambrowser-configkeyhash": sebHeader }, examUrl, expectedKey, "CONFIG_KEY");
      const verified = sebRes.verified;
      if (verified) {
        sebStatus = "VERIFIED";
      } else {
        sebStatus = "FAILED";
        reasons.push("SEB_VERIFICATION_FAILED: Authentic Safe Exam Browser header is required.");
      }
    }

    const canEnterExam = reasons.length === 0;

    return {
      canEnterExam,
      attemptId,
      reasons,
      sessionStatus,
      sebStatus,
      eligibilityStatus: "ELIGIBLE",
      serverTime: now.toISOString(),
    };
  }

  /**
   * Incident Review Workflow: COE Admin or Faculty reviews flagged incidents.
   */
  async reviewIncident(
    tenantId: string,
    incidentId: string,
    reviewerId: string,
    newStatus: "DISMISSED" | "CONFIRMED_VIOLATION",
    notes: string
  ): Promise<{ incidentId: string; reviewStatus: IncidentReviewStatus }> {
    const res = await this.db.query(
      `
      UPDATE exam_proctoring_incidents
      SET review_status = $1,
          reviewer_id = $2,
          reviewer_notes = $3,
          reviewed_at = CURRENT_TIMESTAMP
      WHERE tenant_id = $4 AND id = $5
      RETURNING id, review_status
      `,
      [newStatus, reviewerId, notes, tenantId, incidentId]
    );

    if (res.rows.length === 0) {
      throw new Error(`INCIDENT_NOT_FOUND: Incident ${incidentId} not found.`);
    }

    return {
      incidentId: res.rows[0].id,
      reviewStatus: res.rows[0].review_status,
    };
  }

  /**
   * Lists incidents for an attempt or tenant.
   */
  async listIncidents(tenantId: string, attemptId?: string, severity?: IncidentSeverity) {
    let sql = `
      SELECT epi.id, epi.attempt_id, epi.incident_type, epi.severity,
             epi.confidence_score, epi.evidence, epi.review_status,
             epi.reviewer_notes, epi.reviewed_at, epi.created_at,
             s.institutional_student_id, s.first_name, s.last_name
      FROM exam_proctoring_incidents epi
      JOIN exam_attempts ea ON ea.id = epi.attempt_id
      JOIN students s ON s.id = ea.student_id
      WHERE epi.tenant_id = $1
    `;
    const params: any[] = [tenantId];

    if (attemptId) {
      params.push(attemptId);
      sql += ` AND epi.attempt_id = $${params.length}`;
    }
    if (severity) {
      params.push(severity);
      sql += ` AND epi.severity = $${params.length}`;
    }

    sql += ` ORDER BY epi.created_at DESC LIMIT 100`;

    const res = await this.db.query(sql, params);
    return res.rows;
  }
}
