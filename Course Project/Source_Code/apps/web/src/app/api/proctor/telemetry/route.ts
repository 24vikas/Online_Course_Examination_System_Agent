import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { getDbPool } from "../../../../lib/db";
import { logEvent } from "../../../../lib/logger";
import { handleCorsPreflight, jsonWithCors } from "../../../../lib/cors";

export const dynamic = "force-dynamic";
export const OPTIONS = handleCorsPreflight;

const MAX_BYTES = 16_384;
const incidentSchema = z.object({
  incidentType: z.enum([
    "FACE_ABSENT", "MULTIPLE_FACES", "EXTREME_HEAD_POSE", "GAZE_EXCURSION",
    "IDENTITY_SWAP_SUSPECTED", "MULTIPLE_SPEAKERS", "PHONE_DETECTED",
    "UNAUTHORIZED_LAPTOP", "AUDIO_ANOMALY", "VOICE_ACTIVITY",
    "FACE_NOT_PRESENT", "MULTIPLE_FACES_DETECTED", "HEAD_POSE_DEVIATION",
    "GAZE_OFF_SCREEN", "SUSTAINED_GAZE", "MULTI_SPEAKER_SUSPECTED",
    "LOOK_AWAY", "CAMERA_BLOCKED", "CAMERA_FROZEN", "HEAD_TURN", "AUDIO_VOICE",
    "SECONDARY_DEVICE_DETECTED", "FACE_OUTSIDE_VIEW_ZONE", "GAZE_DEVIATION",
    "LIGHTING_ANOMALY", "LOW_FRAME_QUALITY",
    "HEAD_TURN_LEFT", "HEAD_TURN_RIGHT", "GAZE_AWAY", "FACE_NOT_VISIBLE",
    "CAMERA_DISCONNECTED", "HEAD_PITCH_UP", "HEAD_PITCH_DOWN",
  ]),
  severity: z.enum(["INFO", "LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  confidence: z.number().min(0).max(1),
  evidence: z.object({
    reason: z.string().max(384).optional(),
    source: z.string().max(80).optional(),
    detector: z.string().max(80).optional(),
    timestamp: z.string().datetime().optional(),
  }).strict(),
}).strict();

const payloadSchema = z.object({
  attemptId: z.string().uuid(),
  tenantId: z.string().uuid().optional(),
  eventId: z.string().uuid(),
  incidents: z.array(incidentSchema).min(1).max(12).optional(),
  state: z.object({
    facePresence: z.string().max(32).optional(),
    headPoseStatus: z.string().max(32).optional(),
    gazeStatus: z.string().max(32).optional(),
  }).optional(),
}).strict();

async function readLimitedJson(req: NextRequest): Promise<unknown> {
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function reject(status: number, error: string) {
  return jsonWithCors({ error }, { status });
}

export async function POST(req: NextRequest) {
  const authorization = req.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return reject(401, "Unauthorized");
  const token = authorization.slice(7);
  if (/^aura_web_[a-f0-9]{64}$/.test(token)) return reject(403, "Forbidden");
  // Opaque credentials carry a dedicated audience and purpose in their namespace.
  if (!/^aura_ct_[a-f0-9]{64}$/.test(token)) return reject(401, "Unauthorized");

  const parsed = payloadSchema.safeParse(await readLimitedJson(req));
  if (!parsed.success) return reject(400, "Invalid telemetry");
  const { attemptId, tenantId, eventId, incidents = [], state } = parsed.data;
  const suppliedTenant = req.headers.get("x-tenant-id");
  const hash = createHash("sha256").update(token).digest("hex");

  try {
    const client = await getDbPool().connect();
    try {
      await client.query("BEGIN");
      const { rows: sessions } = await client.query(
        `SELECT ps.id, ps.tenant_id, ps.student_id, ps.attempt_id, ps.status,
                ps.telemetry_expires_at > clock_timestamp() AS valid
           FROM exam_proctoring_sessions ps
          WHERE ps.session_token_hash = $1 AND ps.telemetry_expires_at IS NOT NULL`,
        [hash]
      );
      const session = sessions.length === 1 ? sessions[0] : null;
      if (!session?.valid) return reject(401, "Unauthorized");
      if (session.attempt_id !== attemptId ||
          (tenantId && tenantId !== session.tenant_id) ||
          (suppliedTenant && suppliedTenant !== session.tenant_id)) {
        return reject(403, "Forbidden");
      }

      // Serialize against submission and then revalidate the credential under its row lock.
      const { rows: attempts } = await client.query(
        `SELECT id, exam_schedule_id, status, submitted_at,
                server_deadline > clock_timestamp() AS within_deadline
           FROM exam_attempts ea WHERE ea.id = $1 AND ea.tenant_id = $2
           AND EXISTS (
             SELECT 1 FROM tenant_memberships tm
             JOIN aura_password_credentials c ON c.membership_id = tm.id
             JOIN students s ON s.id = c.student_id AND s.tenant_id = tm.tenant_id
             WHERE tm.tenant_id = ea.tenant_id AND tm.user_id = ea.student_id AND tm.role = 'STUDENT'
               AND s.id = $3 AND s.is_active AND c.disabled_at IS NULL
           ) FOR UPDATE`,
        [session.attempt_id, session.tenant_id, session.student_id]
      );
      const attempt = attempts[0];
      const { rows: locked } = await client.query(
        `SELECT id FROM exam_proctoring_sessions
          WHERE id = $1 AND session_token_hash = $2
            AND telemetry_expires_at > clock_timestamp()
            AND status IN ('PROCTOR_READY', 'IN_EXAM', 'MONITORING', 'READY')
          FOR UPDATE`,
        [session.id, hash]
      );
      if (!locked.length) return reject(401, "Unauthorized");
      if (!attempt || !attempt.exam_schedule_id || attempt.status !== "IN_PROGRESS" ||
          attempt.submitted_at || !attempt.within_deadline) return reject(409, "Attempt closed");

      const record = await client.query(
        `INSERT INTO telemetry_outbox
           (tenant_id, attempt_id, session_id, sequence_number, idempotency_key, payload, status, processed_at)
         VALUES ($1, $2, $3, 0, $4, $5, 'PROCESSED', clock_timestamp())
         ON CONFLICT (tenant_id, attempt_id, idempotency_key) DO NOTHING
         RETURNING id`,
        [session.tenant_id, attempt.id, session.id, eventId,
          JSON.stringify({ eventId, incidents, scheduleId: attempt.exam_schedule_id })]
      );
      if (!record.rowCount) return jsonWithCors({ success: true, duplicate: true });

      for (const incident of incidents) {
        const evidence = { ...incident.evidence, eventId };
        await client.query(
          `INSERT INTO exam_proctoring_incidents
             (tenant_id, attempt_id, session_id, incident_type, severity, confidence_score, evidence)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [session.tenant_id, attempt.id, session.id, incident.incidentType,
            incident.severity, incident.confidence, JSON.stringify(evidence)]
        );
        await client.query(
          `INSERT INTO attempt_integrity_signals (tenant_id, attempt_id, signal_type, metadata, review_status)
           VALUES ($1, $2, $3, $4, 'PENDING_REVIEW')`,
          [session.tenant_id, attempt.id, incident.incidentType,
            JSON.stringify({ ...evidence, severity: incident.severity, confidence: incident.confidence })]
        );
      }
      // Derive current tracking state from payload or incoming incidents
      let currentFacePresence = state?.facePresence || null;
      let currentHeadPose = state?.headPoseStatus || null;
      let currentGaze = state?.gazeStatus || null;

      for (const inc of incidents) {
        if (inc.incidentType === "FACE_ABSENT" || inc.incidentType === "FACE_NOT_VISIBLE") {
          currentFacePresence = "NO_FACE";
        } else if (inc.incidentType === "MULTIPLE_FACES") {
          currentFacePresence = "MULTIPLE_FACES";
        } else if (inc.incidentType === "HEAD_TURN_LEFT") {
          currentHeadPose = "HEAD_TURN_LEFT";
        } else if (inc.incidentType === "HEAD_TURN_RIGHT") {
          currentHeadPose = "HEAD_TURN_RIGHT";
        } else if (inc.incidentType === "HEAD_PITCH_UP") {
          currentHeadPose = "HEAD_PITCH_UP";
        } else if (inc.incidentType === "HEAD_PITCH_DOWN") {
          currentHeadPose = "HEAD_PITCH_DOWN";
        } else if (inc.incidentType === "GAZE_AWAY") {
          currentGaze = "LOOKING_AWAY";
        }
      }

      await client.query(
        `UPDATE exam_proctoring_sessions
            SET last_heartbeat_at = clock_timestamp(),
                updated_at = clock_timestamp(),
                face_presence_status = COALESCE($2, face_presence_status),
                head_pose_status = COALESCE($3, head_pose_status),
                gaze_tracking_status = COALESCE($4, gaze_tracking_status)
          WHERE id = $1`,
        [session.id, currentFacePresence, currentHeadPose, currentGaze]
      );
      await client.query("COMMIT");
      return jsonWithCors({ success: true, incidentsCreated: incidents.length });
    } finally {
      try {
        await client.query("ROLLBACK");
      } finally {
        client.release();
      }
    }
  } catch {
    logEvent("error", "Could not persist companion telemetry");
    return reject(500, "Could not persist telemetry");
  }
}
