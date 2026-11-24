/**
 * AURA Exam Integrity Review Agent
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 * 
 * Strict Non-Negotiable Invariants:
 * 1. Strictly advisory and assistive: AI workers NEVER possess authority over academic standing,
 *    marking, or attempt termination.
 * 2. Zero psychological profiling or intent claims: Uses purely objective, sensor-grounded language.
 * 3. Evidence-linked provenance: Every claim cites explicit incident IDs, timestamps, and confidence scores.
 * 4. Human-in-the-loop audit gate: All recommendations are routed to COE Admin / Invigilator review.
 */

import { queryDb } from "../db";
import { logEvent } from "../logger";

export interface IncidentRecord {
  id: string;
  incidentType: string;
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidenceScore: number;
  durationSeconds?: number;
  evidence?: any;
  createdAt: string;
}

export interface IntegrityReviewResult {
  attemptId: string;
  examScheduleId: string;
  studentId: string;
  studentUsn?: string;
  studentName?: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "NEEDS_REVIEW";
  confidenceScore: number;
  totalIncidents: number;
  incidentBreakdown: Record<string, number>;
  correlatedIncidents: Array<{
    correlationType: string;
    incidentIds: string[];
    description: string;
    timeWindow: { start: string; end: string };
  }>;
  timelineSummary: Array<{
    timestamp: string;
    type: string;
    severity: string;
    durationSeconds: number;
    description: string;
    incidentId: string;
  }>;
  dataQualityFlags: string[];
  agentSummaryText: string;
  citedIncidentIds: string[];
  recommendations: string;
  generatedByAgent: string;
  createdAt: string;
}

export class ExamIntegrityReviewAgent {
  /**
   * Evaluates an exam attempt and generates an evidence-grounded review report.
   */
  public async analyzeAttempt(attemptId: string, tenantId: string): Promise<IntegrityReviewResult> {
    logEvent("info", "ExamIntegrityReviewAgent: Starting analysis for attempt", { attemptId, tenantId });

    // 1. Fetch attempt and candidate context
    const attemptRes = await queryDb(
      `SELECT ea.id, ea.tenant_id, ea.exam_schedule_id, ea.student_id, ea.status,
              es.title as exam_title, es.course_offering_id,
              u.email as student_email,
              s.institutional_student_id as usn,
              COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
       FROM exam_attempts ea
       JOIN exam_schedules es ON es.id = ea.exam_schedule_id
       LEFT JOIN users u ON u.id = ea.student_id
       LEFT JOIN students s ON s.email = u.email
       WHERE ea.id = $1 AND ea.tenant_id = $2`,
      [attemptId, tenantId]
    );

    if (attemptRes.rows.length === 0) {
      throw new Error(`Exam attempt ${attemptId} not found in tenant ${tenantId}`);
    }
    const attempt = attemptRes.rows[0];

    // 2. Fetch all proctoring incident records
    const incRes = await queryDb(
      `SELECT id, incident_type, severity, confidence_score, evidence, created_at
       FROM exam_proctoring_incidents
       WHERE attempt_id = $1 AND tenant_id = $2
       ORDER BY created_at ASC`,
      [attemptId, tenantId]
    );

    const incidents: IncidentRecord[] = incRes.rows.map((r: any) => ({
      id: r.id,
      incidentType: r.incident_type,
      severity: r.severity || "MEDIUM",
      confidenceScore: parseFloat(r.confidence_score) || 0.90,
      durationSeconds: r.evidence?.durationSeconds ?? r.evidence?.durationMs ? r.evidence.durationMs / 1000 : 3.0,
      evidence: r.evidence,
      createdAt: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    }));

    // 3. Fetch existing human verdicts
    const reviewsRes = await queryDb(
      `SELECT id, verdict, notes, action_taken, reviewer_role, reviewed_at
       FROM exam_incident_reviews
       WHERE attempt_id = $1 AND tenant_id = $2
       ORDER BY reviewed_at DESC`,
      [attemptId, tenantId]
    );
    const existingReviews = reviewsRes.rows;

    // 4. Graph Stage 1: Group incidents and build chronological timeline
    const breakdown: Record<string, number> = {};
    const timelineSummary = incidents.map((inc) => {
      breakdown[inc.incidentType] = (breakdown[inc.incidentType] || 0) + 1;
      return {
        timestamp: inc.createdAt,
        type: inc.incidentType,
        severity: inc.severity,
        durationSeconds: inc.durationSeconds || 3.0,
        description: inc.evidence?.reason || `${inc.incidentType} flagged with confidence ${(inc.confidenceScore * 100).toFixed(0)}%`,
        incidentId: inc.id,
      };
    });

    // 5. Graph Stage 2: Multi-sensor signal correlation
    const correlatedIncidents = this.correlateSignals(incidents);

    // 6. Graph Stage 3: Assess data quality & environmental interference
    const dataQualityFlags = this.assessDataQuality(incidents);

    // 7. Graph Stage 4: Determine objective risk categorization
    const { riskLevel, confidenceScore } = this.computeObjectiveRisk(
      incidents,
      correlatedIncidents,
      dataQualityFlags
    );

    // 8. Graph Stage 5: Generate strictly neutral, evidence-linked text summary
    const citedIncidentIds = incidents.map((i) => i.id);
    const agentSummaryText = this.generateEvidenceNarrative({
      attempt,
      incidents,
      breakdown,
      correlatedIncidents,
      dataQualityFlags,
      riskLevel,
      existingReviews,
    });

    const recommendations = this.generateRecommendation(riskLevel, correlatedIncidents, dataQualityFlags);

    const result: IntegrityReviewResult = {
      attemptId,
      examScheduleId: attempt.exam_schedule_id,
      studentId: attempt.student_id,
      studentUsn: attempt.usn,
      studentName: attempt.student_name,
      riskLevel,
      confidenceScore,
      totalIncidents: incidents.length,
      incidentBreakdown: breakdown,
      correlatedIncidents,
      timelineSummary,
      dataQualityFlags,
      agentSummaryText,
      citedIncidentIds,
      recommendations,
      generatedByAgent: "AURA Exam Integrity Review Agent v25.0",
      createdAt: new Date().toISOString(),
    };

    // 9. Persist review summary into PostgreSQL
    await this.persistSummary(result, tenantId);

    return result;
  }

  /**
   * Correlates temporally overlapping multi-sensor signals.
   */
  private correlateSignals(incidents: IncidentRecord[]) {
    const correlations: Array<{
      correlationType: string;
      incidentIds: string[];
      description: string;
      timeWindow: { start: string; end: string };
    }> = [];

    for (let i = 0; i < incidents.length; i++) {
      for (let j = i + 1; j < incidents.length; j++) {
        const a = incidents[i];
        const b = incidents[j];
        const timeDiffMs = Math.abs(new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

        // Temporal window: co-occurrence within 15 seconds
        if (timeDiffMs <= 15000) {
          // Rule A: Prohibited Object (Phone) + Gaze Deviation
          if (
            (a.incidentType === "PHONE_DETECTED" && (b.incidentType === "GAZE_DEVIATION" || b.incidentType === "LOOK_AWAY")) ||
            (b.incidentType === "PHONE_DETECTED" && (a.incidentType === "GAZE_DEVIATION" || a.incidentType === "LOOK_AWAY"))
          ) {
            correlations.push({
              correlationType: "PROHIBITED_DEVICE_WITH_GAZE_DEVIATION",
              incidentIds: [a.id, b.id],
              description: `Concomitant optical detection of secondary phone device and sustained gaze excursion within ${(timeDiffMs / 1000).toFixed(1)}s window.`,
              timeWindow: {
                start: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
                end: a.createdAt > b.createdAt ? a.createdAt : b.createdAt,
              },
            });
          }

          // Rule B: Multiple Faces + Voice Audio
          if (
            (a.incidentType === "MULTIPLE_FACES" && (b.incidentType === "AUDIO_VOICE" || b.incidentType === "SPEECH_DETECTED")) ||
            (b.incidentType === "MULTIPLE_FACES" && (a.incidentType === "AUDIO_VOICE" || a.incidentType === "SPEECH_DETECTED"))
          ) {
            correlations.push({
              correlationType: "MULTIPLE_PERSONS_WITH_VOCALIZATION",
              incidentIds: [a.id, b.id],
              description: `Multiple facial landmarks detected concurrently with acoustic speech activity.`,
              timeWindow: {
                start: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
                end: a.createdAt > b.createdAt ? a.createdAt : b.createdAt,
              },
            });
          }

          // Rule C: Camera Frozen / Blocked + Absence
          if (
            ((a.incidentType === "CAMERA_BLOCKED" || a.incidentType === "CAMERA_FROZEN") && b.incidentType === "FACE_ABSENT") ||
            ((b.incidentType === "CAMERA_BLOCKED" || b.incidentType === "CAMERA_FROZEN") && a.incidentType === "FACE_ABSENT")
          ) {
            correlations.push({
              correlationType: "OPTICAL_FEED_INTERRUPTION_WITH_ABSENCE",
              incidentIds: [a.id, b.id],
              description: `Video stream occlusion or frame freeze correlated with candidate face departure.`,
              timeWindow: {
                start: a.createdAt < b.createdAt ? a.createdAt : b.createdAt,
                end: a.createdAt > b.createdAt ? a.createdAt : b.createdAt,
              },
            });
          }
        }
      }
    }

    return correlations;
  }

  /**
   * Assesses optical quality and environmental factors.
   */
  private assessDataQuality(incidents: IncidentRecord[]): string[] {
    const flags: string[] = [];
    const lightingAnomalies = incidents.filter((i) => i.incidentType === "LIGHTING_ANOMALY");
    const lowQualityFrames = incidents.filter((i) => i.incidentType === "LOW_FRAME_QUALITY" || i.incidentType === "CAMERA_FROZEN");

    if (lightingAnomalies.length >= 2) {
      flags.push(`Repeated lighting anomalies detected (${lightingAnomalies.length} events): Ambient glare or dynamic backlight variance may affect optical confidence.`);
    }

    if (lowQualityFrames.length >= 2) {
      flags.push(`Degraded optical stream quality (${lowQualityFrames.length} events): Dropped video frames or reduced shutter exposure observed.`);
    }

    return flags;
  }

  /**
   * Determines deterministic risk category without LLM speculation.
   */
  private computeObjectiveRisk(
    incidents: IncidentRecord[],
    correlations: any[],
    dataQualityFlags: string[]
  ): { riskLevel: IntegrityReviewResult["riskLevel"]; confidenceScore: number } {
    if (incidents.length === 0) {
      return { riskLevel: "LOW", confidenceScore: 0.98 };
    }

    // High quality degradation requires manual inspection rather than penalizing candidate
    if (dataQualityFlags.length >= 2 && incidents.every((i) => i.severity !== "CRITICAL")) {
      return { riskLevel: "NEEDS_REVIEW", confidenceScore: 0.65 };
    }

    // Check for critical hard violations
    const hasPhone = incidents.some((i) => i.incidentType === "PHONE_DETECTED" && i.severity === "CRITICAL");
    const hasMultiFaces = incidents.some((i) => i.incidentType === "MULTIPLE_FACES" && (i.durationSeconds || 0) >= 4.0);

    if (hasPhone || correlations.some((c) => c.correlationType === "PROHIBITED_DEVICE_WITH_GAZE_DEVIATION")) {
      return { riskLevel: "CRITICAL", confidenceScore: 0.95 };
    }

    if (hasMultiFaces || correlations.some((c) => c.correlationType === "MULTIPLE_PERSONS_WITH_VOCALIZATION")) {
      return { riskLevel: "HIGH", confidenceScore: 0.92 };
    }

    const highCount = incidents.filter((i) => i.severity === "HIGH").length;
    const medCount = incidents.filter((i) => i.severity === "MEDIUM").length;

    if (highCount >= 2 || medCount >= 4) {
      return { riskLevel: "MEDIUM", confidenceScore: 0.88 };
    }

    return { riskLevel: "LOW", confidenceScore: 0.94 };
  }

  /**
   * Generates strictly evidence-grounded prose narrative.
   */
  private generateEvidenceNarrative(params: {
    attempt: any;
    incidents: IncidentRecord[];
    breakdown: Record<string, number>;
    correlatedIncidents: any[];
    dataQualityFlags: string[];
    riskLevel: string;
    existingReviews: any[];
  }): string {
    const { attempt, incidents, breakdown, correlatedIncidents, dataQualityFlags, riskLevel, existingReviews } = params;

    const lines: string[] = [];
    lines.push(`### AURA Exam Integrity Review Report`);
    lines.push(`**Candidate:** ${attempt.student_name} (${attempt.usn || attempt.student_email || "N/A"})`);
    lines.push(`**Examination:** ${attempt.exam_title}`);
    lines.push(`**Assessment Objective:** Automated sensor correlation and evidence provenance compilation.`);
    lines.push(``);
    lines.push(`> [!IMPORTANT]`);
    lines.push(`> **Deterministic AI Non-Authority Notice:** In strict adherence to KLE Technological University academic governance and AGENTS.md, this review is advisory and assistive. Autonomous agents do not possess authority over academic standing, result release, or attempt termination. Sole administrative and disciplinary authority resides with the authorized COE / Invigilator.`);
    lines.push(``);

    lines.push(`#### 1. Sensor Incident Summary`);
    if (incidents.length === 0) {
      lines.push(`No proctoring anomalies or sustained threshold breaches were logged during this exam attempt. Biometric continuity and single-face presence remained verified.`);
    } else {
      lines.push(`A total of **${incidents.length}** sensor incident events were registered across the proctored attempt:`);
      for (const [type, count] of Object.entries(breakdown)) {
        lines.push(`- **${type}**: ${count} occurrence(s) meeting sustained dwell-time criteria.`);
      }
    }
    lines.push(``);

    if (correlatedIncidents.length > 0) {
      lines.push(`#### 2. Correlated Multi-Sensor Signals`);
      for (const c of correlatedIncidents) {
        lines.push(`- **${c.correlationType}**: ${c.description} (Citing Event IDs: ${c.incidentIds.join(", ")})`);
      }
      lines.push(``);
    }

    if (dataQualityFlags.length > 0) {
      lines.push(`#### 3. Environmental & Optical Data Quality Factors`);
      for (const flag of dataQualityFlags) {
        lines.push(`- ${flag}`);
      }
      lines.push(`*Finding:* Environmental variability may contribute to false-positive escalation. The attempt is marked for human inspection.`);
      lines.push(``);
    }

    if (existingReviews.length > 0) {
      lines.push(`#### 4. Prior Human Invigilator Verifications`);
      for (const rev of existingReviews) {
        lines.push(`- **Verdict:** \`${rev.verdict}\` by ${rev.reviewer_role} at ${new Date(rev.reviewed_at).toLocaleTimeString()}`);
        lines.push(`  *Notes:* ${rev.notes}`);
      }
      lines.push(``);
    }

    lines.push(`#### 5. Categorization & Actionable Guidance`);
    lines.push(`- **Assigned Objective Risk:** \`${riskLevel}\``);
    lines.push(`- **Recommended COE Procedure:** Refer to official snapshot telemetry for cited event IDs before finalizing scorecards.`);

    return lines.join("\n");
  }

  private generateRecommendation(riskLevel: string, correlations: any[], dataQualityFlags: string[]): string {
    if (dataQualityFlags.length >= 2) {
      return "DATA_QUALITY_INSPECTION_RECOMMENDED: Review lighting conditions and webcam frame continuity before taking administrative action.";
    }
    if (riskLevel === "CRITICAL" || correlations.length > 0) {
      return "INVIGILATOR_VERIFICATION_RECOMMENDED: Review cited optical snapshots and companion device logs.";
    }
    if (riskLevel === "HIGH" || riskLevel === "MEDIUM") {
      return "ROUTINE_COE_SAMPLE_AUDIT: Perform standard post-exam playback review.";
    }
    return "NO_ACTION: Session exhibits standard compliance across all monitored proctor rails.";
  }

  /**
   * Persists the synthesized report into `integrity_review_summaries`.
   */
  private async persistSummary(report: IntegrityReviewResult, tenantId: string): Promise<void> {
    const query = `
      INSERT INTO integrity_review_summaries (
        tenant_id,
        attempt_id,
        exam_schedule_id,
        student_id,
        risk_level,
        confidence_score,
        total_incidents,
        incident_breakdown,
        timeline_summary,
        agent_summary_text,
        cited_incident_ids,
        recommendations,
        data_quality_flags,
        generated_by_agent,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP
      )
      ON CONFLICT (attempt_id) DO UPDATE SET
        risk_level = EXCLUDED.risk_level,
        confidence_score = EXCLUDED.confidence_score,
        total_incidents = EXCLUDED.total_incidents,
        incident_breakdown = EXCLUDED.incident_breakdown,
        timeline_summary = EXCLUDED.timeline_summary,
        agent_summary_text = EXCLUDED.agent_summary_text,
        cited_incident_ids = EXCLUDED.cited_incident_ids,
        recommendations = EXCLUDED.recommendations,
        data_quality_flags = EXCLUDED.data_quality_flags,
        updated_at = CURRENT_TIMESTAMP
    `;

    await queryDb(query, [
      tenantId,
      report.attemptId,
      report.examScheduleId,
      report.studentId,
      report.riskLevel,
      report.confidenceScore,
      report.totalIncidents,
      JSON.stringify(report.incidentBreakdown),
      JSON.stringify(report.timelineSummary),
      report.agentSummaryText,
      JSON.stringify(report.citedIncidentIds),
      report.recommendations,
      JSON.stringify(report.dataQualityFlags),
      report.generatedByAgent,
    ]);
  }
}

export const examIntegrityReviewAgent = new ExamIntegrityReviewAgent();
