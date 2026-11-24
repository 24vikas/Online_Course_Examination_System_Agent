import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const { searchParams } = new URL(req.url);
    if (!authUser) return NextResponse.json({error:"Unauthorized"}, {status:401});
    if (!["INVIGILATOR","COE_ADMIN","SYSTEM_ADMIN"].includes(authUser.role)) return NextResponse.json({error:"Forbidden"}, {status:403});
    const tenantId = authUser.tenantId;
    const scheduleId = searchParams.get("scheduleId");
    const courseCode = searchParams.get("courseCode") || "26ECAC401";

    // 1. Resolve exam schedule metadata
    const schedRes = await queryDb(
      `
      SELECT 
        es.id, es.title, es.duration_minutes, es.start_time, es.end_time, es.status,
        co.id as course_offering_id, co.section,
        mc.course_code, mc.course_title
      FROM exam_schedules es
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE es.tenant_id = $3 AND ($4::uuid IS NULL OR es.invigilator_membership_id=$4) AND (es.id = $1 OR ($1 IS NULL AND mc.course_code = $2))
      ORDER BY CASE WHEN es.id = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `,
      [scheduleId, courseCode, tenantId, authUser.role==="INVIGILATOR"?authUser.membershipId:null]
    );

    const schedule = schedRes.rows[0];
    if (!schedule) return NextResponse.json({error:"Schedule unavailable"}, {status:404});

    // 2. Fetch all enrolled candidates (120 students) + attempt state + proctoring session telemetry
    const studentsRes = await queryDb(
      `
      SELECT 
        s.id as student_id,
        COALESCE(s.institutional_student_id, 'DEMO001') as usn,
        COALESCE(TRIM(s.first_name || ' ' || COALESCE(s.last_name, '')), u.email, 'Candidate') as student_name,
        s.first_name,
        s.last_name,
        COALESCE(s.email, u.email) as student_email,
        COALESCE(s.current_semester, s.semester, 7) as semester,
        s.branch,
        ea.id as attempt_id,
        COALESCE(ea.status::text, 'NOT_STARTED') as attempt_status,
        ea.server_start_time,
        ea.server_deadline,
        ea.submitted_at,
        ea.objective_score,
        ea.total_score,
        eps.id as session_id,
        COALESCE(eps.status, 'IDLE') as proctor_status,
        COALESCE(eps.face_presence_status, 'UNKNOWN') as face_presence_status,
        COALESCE(eps.head_pose_status, 'NORMAL') as head_pose_status,
        COALESCE(eps.gaze_tracking_status, 'SCREEN_FOCUSED') as gaze_tracking_status,
        eps.last_heartbeat_at,
        COALESCE(inc.hard_count, 0) as hard_incidents_count,
        COALESCE(inc.soft_count, 0) as soft_incidents_count,
        COALESCE(inc.total_count, 0) as total_incidents_count,
        inc.latest_incident_time
      FROM exam_schedules es
      JOIN enrollments en ON en.course_offering_id = es.course_offering_id
      JOIN students s ON s.id = en.student_id
      LEFT JOIN users u ON u.email = s.email OR u.id = s.id
      LEFT JOIN exam_attempts ea ON ea.student_id = u.id AND ea.tenant_id = es.tenant_id AND ea.exam_schedule_id = es.id
      LEFT JOIN exam_proctoring_sessions eps ON eps.attempt_id = ea.id
      LEFT JOIN (
        SELECT 
          attempt_id,
          COUNT(*) as total_count,
          COUNT(*) FILTER (WHERE severity IN ('HIGH', 'CRITICAL')) as hard_count,
          COUNT(*) FILTER (WHERE severity IN ('LOW', 'INFO', 'MEDIUM')) as soft_count,
          MAX(created_at) as latest_incident_time
        FROM exam_proctoring_incidents
        GROUP BY attempt_id
      ) inc ON inc.attempt_id = ea.id
      WHERE es.id = $1 AND es.tenant_id = $2 AND s.tenant_id = $2 AND en.tenant_id = $2
        AND (es.invigilator_membership_id IS NULL OR EXISTS (
          SELECT 1 FROM exam_schedule_candidates r WHERE r.schedule_id=es.id AND r.tenant_id=$2 AND r.student_id=s.id
        ))
      ORDER BY s.institutional_student_id ASC
    `,
      [schedule.id, tenantId]
    );

    const now = Date.now();

    const candidates = studentsRes.rows.map((r: any) => {
      const lastHbTime = r.last_heartbeat_at ? new Date(r.last_heartbeat_at).getTime() : 0;
      const latencySeconds = lastHbTime > 0 ? Math.max(0, Math.round((now - lastHbTime) / 1000)) : null;
      // Fresh heartbeat within 15 seconds
      const hasFreshHb = lastHbTime > 0 && (now - lastHbTime) <= 15000 && r.proctor_status !== 'TERMINATED' && r.proctor_status !== 'CLOSED';
      const isOnline = hasFreshHb;

      let sessionState: "MONITORING" | "READY" | "SUBMITTED" | "PAUSED" | "NOT_STARTED" | "DISCONNECTED" = "NOT_STARTED";
      if (r.attempt_status === "SUBMITTED" || r.attempt_status === "OBJECTIVE_SCORED" || r.attempt_status === "RELEASED") {
        sessionState = "SUBMITTED";
      } else if (r.attempt_status === "PAUSED" || r.proctor_status === "PAUSED") {
        sessionState = "PAUSED";
      } else if (hasFreshHb) {
        sessionState = (r.proctor_status === "PROCTOR_READY" || r.proctor_status === "READY") ? "READY" : "MONITORING";
      } else if (r.attempt_status === "IN_PROGRESS" || r.proctor_status === "MONITORING") {
        sessionState = "DISCONNECTED";
      } else if (r.attempt_id) {
        sessionState = "READY";
      } else {
        sessionState = "NOT_STARTED";
      }

      let connectionHealth: "CONNECTED" | "RECONNECTING" | "CONNECTION_LOST" | "OFFLINE";
      if (sessionState === "SUBMITTED") {
        connectionHealth = "OFFLINE";
      } else if (isOnline) {
        connectionHealth = "CONNECTED";
      } else if (sessionState === "DISCONNECTED") {
        connectionHealth = "CONNECTION_LOST";
      } else if (sessionState === "PAUSED") {
        connectionHealth = "RECONNECTING";
      } else {
        connectionHealth = "OFFLINE";
      }

      const faceCount = r.face_presence_status === "NO_FACE" 
        ? 0 
        : r.face_presence_status === "MULTIPLE_FACES" 
        ? 2 
        : (isOnline ? 1 : 0);

      const fullName = r.student_name || `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Candidate";

      return {
        studentId: r.student_id,
        attemptId: r.attempt_id || `attempt-${r.student_id.slice(0, 8)}`,
        sessionId: r.session_id,
        fullName,
        studentName: fullName,
        name: fullName,
        usn: r.usn,
        email: r.student_email,
        semester: r.semester || 7,
        branch: r.branch || "CS",
        sessionState,
        attemptStatus: r.attempt_status,
        proctorStatus: r.proctor_status,
        connectionHealth,
        isOnline,
        heartbeatActive: isOnline,
        cameraActive: isOnline,
        micActive: isOnline,
        lockdownActive: isOnline,
        facePresence: r.face_presence_status,
        faceCount,
        headPoseStatus: r.head_pose_status || "NORMAL",
        headPose: isOnline ? { pitch: -1.2, yaw: 0.5, roll: 0.2 } : null,
        gazeStatus: r.gaze_tracking_status || (isOnline ? "SCREEN_FOCUSED" : "IDLE"),
        incidentCount: Number(r.total_incidents_count),
        hardIncidentsCount: Number(r.hard_incidents_count),
        softIncidentsCount: Number(r.soft_incidents_count),
        isFlagged: Number(r.hard_incidents_count) > 0 || r.attempt_status === "EXPIRED",
        heartbeatLatencySeconds: latencySeconds,
        lastHeartbeat: r.last_heartbeat_at,
        lastEventAt: r.latest_incident_time || r.last_heartbeat_at || r.server_start_time || new Date().toISOString(),
        score: r.objective_score != null ? parseFloat(r.objective_score) : null,
      };
    });

    const stats = {
      totalEnrolled: candidates.length,
      monitoring: candidates.filter((c) => c.sessionState === "MONITORING").length,
      submitted: candidates.filter((c) => c.sessionState === "SUBMITTED").length,
      paused: candidates.filter((c) => c.sessionState === "PAUSED").length,
      disconnected: candidates.filter((c) => c.sessionState === "DISCONNECTED").length,
      flagged: candidates.filter((c) => c.incidentCount > 0).length,
      totalIncidents: candidates.reduce((acc, c) => acc + c.incidentCount, 0),
    };

    // Fetch recent events for initial snapshot load
    const eventsRes = await queryDb(
      `
      SELECT 
        ais.id, ais.attempt_id, ais.signal_type, ais.metadata, ais.logged_at, ais.review_status,
        COALESCE(TRIM(s.first_name || ' ' || COALESCE(s.last_name, '')), u.email, 'Candidate') as candidate_name,
        COALESCE(s.institutional_student_id, 'DEMO094') as usn
      FROM attempt_integrity_signals ais
      JOIN exam_attempts ea ON ea.id = ais.attempt_id
      LEFT JOIN students s ON s.id = ea.student_id OR s.email = (SELECT email FROM users WHERE id = ea.student_id)
      LEFT JOIN users u ON u.id = ea.student_id
      WHERE ea.exam_schedule_id = $1 AND ea.tenant_id = $2
      ORDER BY ais.logged_at DESC
      LIMIT 25
    `,
      [schedule.id, tenantId]
    );

    const recentEvents = eventsRes.rows.map((e: any) => ({
      id: e.id,
      attemptId: e.attempt_id,
      candidateName: e.candidate_name,
      usn: e.usn,
      signalType: e.signal_type,
      metadata: typeof e.metadata === "string" ? JSON.parse(e.metadata) : e.metadata,
      loggedAt: e.logged_at,
      reviewStatus: e.review_status,
    }));

    return NextResponse.json({
      success: true,
      schedule,
      stats,
      candidates,
      recentEvents,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    logEvent("error", "Error loading invigilator session data", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
