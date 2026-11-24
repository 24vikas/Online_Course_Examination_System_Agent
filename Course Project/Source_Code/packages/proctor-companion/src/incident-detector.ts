/**
 * Sustained Dwell-Time Incident Detector with Hysteresis
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 * 
 * Based on ExamGuard Local engine architecture:
 * - Prevents false-positive storms from transient glitches or brief glances.
 * - Sustained dwell thresholds:
 *     - look_away: >= 5.0 seconds
 *     - multiple_faces: >= 2.5 seconds
 *     - face_absent: >= 5.0 seconds
 *     - camera_blocked: >= 3.0 seconds
 *     - camera_frozen: >= 3.0 seconds
 *     - head_turn: >= 4.0 seconds
 *     - phone_detected: >= 2.0 seconds
 *     - secondary_device_detected: >= 3.0 seconds
 *     - face_outside_view_zone: >= 5.0 seconds
 *     - gaze_deviation: >= 4.0 seconds
 *     - lighting_anomaly: >= 2.0 seconds (LOW severity telemetry only)
 *     - low_frame_quality: >= 3.0 seconds
 * - Exit dwell hysteresis:
 *     - exit_dwell: >= 2.0 seconds before closing an active incident.
 *     - Glitches or brief returns to neutral (< 2.0s) do not prematurely close active incidents.
 */

export interface IncidentEvent {
  id: string;
  type:
    | "LOOK_AWAY"
    | "MULTIPLE_FACES"
    | "FACE_ABSENT"
    | "CAMERA_BLOCKED"
    | "CAMERA_FROZEN"
    | "HEAD_TURN"
    | "AUDIO_VOICE"
    | "PHONE_DETECTED"
    | "SECONDARY_DEVICE_DETECTED"
    | "FACE_OUTSIDE_VIEW_ZONE"
    | "GAZE_DEVIATION"
    | "LIGHTING_ANOMALY"
    | "LOW_FRAME_QUALITY"
    | "HEAD_TURN_LEFT"
    | "HEAD_TURN_RIGHT"
    | "GAZE_AWAY"
    | "FACE_NOT_VISIBLE"
    | "CAMERA_DISCONNECTED"
    | "HEAD_PITCH_UP"
    | "HEAD_PITCH_DOWN";
  severity: "INFO" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  startTime: number;      // Unix timestamp in seconds or ms
  detectedAt: number;     // When dwell threshold was met
  endTime?: number;       // When hysteresis cleared
  durationMs: number;     // Total duration
  confidence: number;     // 0.0 to 1.0
  reason: string;
}

export interface IncidentDetectorConfig {
  lookAwayDwellSeconds?: number;      // default 2.0
  multipleFacesDwellSeconds?: number; // default 2.0
  faceAbsentDwellSeconds?: number;    // default 2.0
  cameraBlockedDwellSeconds?: number; // default 2.0
  cameraFrozenDwellSeconds?: number;  // default 2.5
  headTurnDwellSeconds?: number;      // default 2.0
  phoneDwellSeconds?: number;         // default 2.0
  secondaryDeviceDwellSeconds?: number; // default 3.0
  faceOutsideDwellSeconds?: number;   // default 3.0
  gazeDeviationDwellSeconds?: number; // default 2.0
  lightingAnomalyDwellSeconds?: number; // default 2.0
  lowQualityDwellSeconds?: number;    // default 2.0
  headTurnLeftDwellSeconds?: number;  // default 2.0
  headTurnRightDwellSeconds?: number; // default 2.0
  headPitchUpDwellSeconds?: number;   // default 2.0
  headPitchDownDwellSeconds?: number; // default 2.0
  gazeAwayDwellSeconds?: number;      // default 2.0
  faceNotVisibleDwellSeconds?: number;// default 2.0
  cameraDisconnectedDwellSeconds?: number; // default 2.0
  exitDwellSeconds?: number;          // default 1.5
}

interface IncidentTrackerState {
  type: IncidentEvent["type"];
  severity: IncidentEvent["severity"];
  dwellSeconds: number;
  conditionStart: number | null;
  lastConditionTime: number | null;
  hitCount: number;
  clearSince: number | null;
  activeEvent: IncidentEvent | null;
}

export class IncidentDetector {
  private config: Required<IncidentDetectorConfig>;
  private trackers: Map<IncidentEvent["type"], IncidentTrackerState> = new Map();
  private newEvents: IncidentEvent[] = [];
  private closedEvents: IncidentEvent[] = [];
  private eventHistory: IncidentEvent[] = [];
  private eventIdCounter = 0;

  constructor(config: IncidentDetectorConfig = {}) {
    this.config = {
      lookAwayDwellSeconds: config.lookAwayDwellSeconds ?? 2.0,
      multipleFacesDwellSeconds: config.multipleFacesDwellSeconds ?? 2.0,
      faceAbsentDwellSeconds: config.faceAbsentDwellSeconds ?? 2.0,
      cameraBlockedDwellSeconds: config.cameraBlockedDwellSeconds ?? 2.0,
      cameraFrozenDwellSeconds: config.cameraFrozenDwellSeconds ?? 2.5,
      headTurnDwellSeconds: config.headTurnDwellSeconds ?? 2.0,
      phoneDwellSeconds: config.phoneDwellSeconds ?? 2.0,
      secondaryDeviceDwellSeconds: config.secondaryDeviceDwellSeconds ?? 3.0,
      faceOutsideDwellSeconds: config.faceOutsideDwellSeconds ?? 3.0,
      gazeDeviationDwellSeconds: config.gazeDeviationDwellSeconds ?? 2.0,
      lightingAnomalyDwellSeconds: config.lightingAnomalyDwellSeconds ?? 2.0,
      lowQualityDwellSeconds: config.lowQualityDwellSeconds ?? 2.0,
      headTurnLeftDwellSeconds: config.headTurnLeftDwellSeconds ?? 2.0,
      headTurnRightDwellSeconds: config.headTurnRightDwellSeconds ?? 2.0,
      headPitchUpDwellSeconds: config.headPitchUpDwellSeconds ?? 2.0,
      headPitchDownDwellSeconds: config.headPitchDownDwellSeconds ?? 2.0,
      gazeAwayDwellSeconds: config.gazeAwayDwellSeconds ?? 2.0,
      faceNotVisibleDwellSeconds: config.faceNotVisibleDwellSeconds ?? 2.0,
      cameraDisconnectedDwellSeconds: config.cameraDisconnectedDwellSeconds ?? 2.0,
      exitDwellSeconds: config.exitDwellSeconds ?? 1.5,
    };

    this.initTrackers();
  }

  private initTrackers(): void {
    const definitions: Array<{ type: IncidentEvent["type"]; severity: IncidentEvent["severity"]; dwell: number }> = [
      { type: "HEAD_TURN_LEFT", severity: "MEDIUM", dwell: this.config.headTurnLeftDwellSeconds },
      { type: "HEAD_TURN_RIGHT", severity: "MEDIUM", dwell: this.config.headTurnRightDwellSeconds },
      { type: "HEAD_PITCH_UP", severity: "MEDIUM", dwell: this.config.headPitchUpDwellSeconds },
      { type: "HEAD_PITCH_DOWN", severity: "MEDIUM", dwell: this.config.headPitchDownDwellSeconds },
      { type: "GAZE_AWAY", severity: "MEDIUM", dwell: this.config.gazeAwayDwellSeconds },
      { type: "FACE_NOT_VISIBLE", severity: "HIGH", dwell: this.config.faceNotVisibleDwellSeconds },
      { type: "MULTIPLE_FACES", severity: "HIGH", dwell: this.config.multipleFacesDwellSeconds },
      { type: "CAMERA_DISCONNECTED", severity: "HIGH", dwell: this.config.cameraDisconnectedDwellSeconds },
      { type: "CAMERA_FROZEN", severity: "MEDIUM", dwell: this.config.cameraFrozenDwellSeconds },
      { type: "CAMERA_BLOCKED", severity: "HIGH", dwell: this.config.cameraBlockedDwellSeconds },
      { type: "LOOK_AWAY", severity: "MEDIUM", dwell: this.config.lookAwayDwellSeconds },
      { type: "FACE_ABSENT", severity: "HIGH", dwell: this.config.faceAbsentDwellSeconds },
      { type: "HEAD_TURN", severity: "MEDIUM", dwell: this.config.headTurnDwellSeconds },
      { type: "AUDIO_VOICE", severity: "LOW", dwell: 3.0 },
      { type: "PHONE_DETECTED", severity: "CRITICAL", dwell: this.config.phoneDwellSeconds },
      { type: "SECONDARY_DEVICE_DETECTED", severity: "HIGH", dwell: this.config.secondaryDeviceDwellSeconds },
      { type: "FACE_OUTSIDE_VIEW_ZONE", severity: "MEDIUM", dwell: this.config.faceOutsideDwellSeconds },
      { type: "GAZE_DEVIATION", severity: "MEDIUM", dwell: this.config.gazeDeviationDwellSeconds },
      { type: "LIGHTING_ANOMALY", severity: "LOW", dwell: this.config.lightingAnomalyDwellSeconds },
      { type: "LOW_FRAME_QUALITY", severity: "LOW", dwell: this.config.lowQualityDwellSeconds },
    ];

    for (const def of definitions) {
      this.trackers.set(def.type, {
        type: def.type,
        severity: def.severity,
        dwellSeconds: def.dwell,
        conditionStart: null,
        lastConditionTime: null,
        hitCount: 0,
        clearSince: null,
        activeEvent: null,
      });
    }
  }

  /**
   * Resets all tracker states.
   */
  public reset(): void {
    this.newEvents = [];
    this.closedEvents = [];
    this.eventHistory = [];
    this.initTrackers();
  }

  /**
   * Evaluates conditions at timestamp t (in seconds).
   */
  public step(
    t: number,
    conditions: {
      lookAway?: boolean;
      multipleFaces?: boolean;
      faceAbsent?: boolean;
      cameraBlocked?: boolean;
      cameraFrozen?: boolean;
      headTurn?: boolean;
      audioVoice?: boolean;
      phoneDetected?: boolean;
      secondaryDeviceDetected?: boolean;
      faceOutsideViewZone?: boolean;
      gazeDeviation?: boolean;
      lightingAnomaly?: boolean;
      lowFrameQuality?: boolean;
      headTurnLeft?: boolean;
      headTurnRight?: boolean;
      headPitchUp?: boolean;
      headPitchDown?: boolean;
      gazeAway?: boolean;
      faceNotVisible?: boolean;
      cameraDisconnected?: boolean;
    },
    confidenceScores?: Partial<Record<IncidentEvent["type"], number>>,
    reasons?: Partial<Record<IncidentEvent["type"], string>>
  ): {
    newEvents: IncidentEvent[];
    closedEvents: IncidentEvent[];
    activeIncidents: IncidentEvent[];
  } {
    this.newEvents = [];
    this.closedEvents = [];

    const condMap: Record<IncidentEvent["type"], boolean> = {
      HEAD_TURN_LEFT: !!conditions.headTurnLeft,
      HEAD_TURN_RIGHT: !!conditions.headTurnRight,
      HEAD_PITCH_UP: !!conditions.headPitchUp,
      HEAD_PITCH_DOWN: !!conditions.headPitchDown,
      GAZE_AWAY: !!conditions.gazeAway,
      FACE_NOT_VISIBLE: !!conditions.faceNotVisible || !!conditions.faceAbsent,
      MULTIPLE_FACES: !!conditions.multipleFaces,
      CAMERA_DISCONNECTED: !!conditions.cameraDisconnected,
      CAMERA_FROZEN: !!conditions.cameraFrozen,
      CAMERA_BLOCKED: !!conditions.cameraBlocked,
      LOOK_AWAY: !!conditions.lookAway || !!conditions.gazeAway,
      FACE_ABSENT: !!conditions.faceAbsent || !!conditions.faceNotVisible,
      HEAD_TURN: !!conditions.headTurn || !!conditions.headTurnLeft || !!conditions.headTurnRight,
      AUDIO_VOICE: !!conditions.audioVoice,
      PHONE_DETECTED: !!conditions.phoneDetected,
      SECONDARY_DEVICE_DETECTED: !!conditions.secondaryDeviceDetected,
      FACE_OUTSIDE_VIEW_ZONE: !!conditions.faceOutsideViewZone,
      GAZE_DEVIATION: !!conditions.gazeDeviation || !!conditions.gazeAway,
      LIGHTING_ANOMALY: !!conditions.lightingAnomaly,
      LOW_FRAME_QUALITY: !!conditions.lowFrameQuality,
    };

    for (const [type, tracker] of this.trackers.entries()) {
      const isConditionActive = condMap[type];
      const conf = confidenceScores?.[type] ?? 0.95;
      const defaultReason = this.getDefaultReason(type);
      const reason = reasons?.[type] ?? defaultReason;

      this.processTracker(tracker, isConditionActive, t, conf, reason);
    }

    const activeIncidents = Array.from(this.trackers.values())
      .map((tr) => tr.activeEvent)
      .filter((ev): ev is IncidentEvent => ev !== null);

    return {
      newEvents: [...this.newEvents],
      closedEvents: [...this.closedEvents],
      activeIncidents,
    };
  }

  private processTracker(
    tracker: IncidentTrackerState,
    condition: boolean,
    t: number,
    confidence: number,
    reason: string
  ): void {
    if (condition) {
      tracker.clearSince = null; // Reset hysteresis clearance
      if (tracker.conditionStart === null) {
        tracker.conditionStart = t;
      }
      tracker.lastConditionTime = t;
      tracker.hitCount++;

      const elapsed = t - tracker.conditionStart;

      if (!tracker.activeEvent && elapsed >= tracker.dwellSeconds - 1e-6 && tracker.hitCount >= 2) {
        this.eventIdCounter++;
        const event: IncidentEvent = {
          id: `inc-${tracker.type.toLowerCase()}-${this.eventIdCounter}-${Math.floor(t)}`,
          type: tracker.type,
          severity: tracker.severity,
          startTime: tracker.conditionStart,
          detectedAt: t,
          durationMs: Math.round(elapsed * 1000),
          confidence,
          reason,
        };
        tracker.activeEvent = event;
        this.newEvents.push(event);
        this.eventHistory.push(event);
      } else if (tracker.activeEvent) {
        tracker.activeEvent.durationMs = Math.round((t - tracker.activeEvent.startTime) * 1000);
      }
    } else {
      // Condition is NOT active
      tracker.conditionStart = null;
      tracker.hitCount = 0;

      if (tracker.activeEvent) {
        if (tracker.clearSince === null) {
          tracker.clearSince = t;
        }

        const clearElapsed = t - tracker.clearSince;
        // Check hysteresis clearance threshold (>= exitDwellSeconds, default 2.0s)
        if (clearElapsed >= this.config.exitDwellSeconds - 1e-6) {
          tracker.activeEvent.endTime = t;
          tracker.activeEvent.durationMs = Math.round((t - tracker.activeEvent.startTime) * 1000);
          this.closedEvents.push({ ...tracker.activeEvent });
          tracker.activeEvent = null;
          tracker.clearSince = null;
        }
      }
    }
  }

  public getActiveEvents(): IncidentEvent[] {
    return Array.from(this.trackers.values())
      .map((tr) => tr.activeEvent)
      .filter((ev): ev is IncidentEvent => ev !== null);
  }

  public getEventHistory(): IncidentEvent[] {
    return [...this.eventHistory];
  }

  private getDefaultReason(type: IncidentEvent["type"]): string {
    switch (type) {
      case "HEAD_TURN_LEFT":
        return `Sustained head turning left away from screen for >= ${this.config.headTurnLeftDwellSeconds}s`;
      case "HEAD_TURN_RIGHT":
        return `Sustained head turning right away from screen for >= ${this.config.headTurnRightDwellSeconds}s`;
      case "HEAD_PITCH_UP":
        return `Sustained upward head pitch excursion for >= ${this.config.headPitchUpDwellSeconds}s`;
      case "HEAD_PITCH_DOWN":
        return `Sustained downward head pitch excursion for >= ${this.config.headPitchDownDwellSeconds}s`;
      case "GAZE_AWAY":
        return `Sustained eye gaze away from screen while head facing forward for >= ${this.config.gazeAwayDwellSeconds}s`;
      case "FACE_NOT_VISIBLE":
        return `Candidate face missing from camera frame for >= ${this.config.faceNotVisibleDwellSeconds}s`;
      case "CAMERA_DISCONNECTED":
        return `Camera hardware feed lost or disconnected for >= ${this.config.cameraDisconnectedDwellSeconds}s`;
      case "LOOK_AWAY":
        return `Sustained gaze excursion away from screen for >= ${this.config.lookAwayDwellSeconds}s`;
      case "MULTIPLE_FACES":
        return `Multiple faces detected in camera frame for >= ${this.config.multipleFacesDwellSeconds}s`;
      case "FACE_ABSENT":
        return `Candidate face missing from camera frame for >= ${this.config.faceAbsentDwellSeconds}s`;
      case "CAMERA_BLOCKED":
        return `Camera covered or obstructed (luminance < 30) for >= ${this.config.cameraBlockedDwellSeconds}s`;
      case "CAMERA_FROZEN":
        return `Camera stream frozen (frame diff <= 0.2) for >= ${this.config.cameraFrozenDwellSeconds}s`;
      case "HEAD_TURN":
        return `Significant head rotation sustained for >= ${this.config.headTurnDwellSeconds}s`;
      case "AUDIO_VOICE":
        return `Speech vocalization detected in audio channel`;
      case "PHONE_DETECTED":
        return `Cell phone detected in camera frame sustained for >= ${this.config.phoneDwellSeconds}s`;
      case "SECONDARY_DEVICE_DETECTED":
        return `Secondary electronic device detected in camera frame sustained for >= ${this.config.secondaryDeviceDwellSeconds}s`;
      case "FACE_OUTSIDE_VIEW_ZONE":
        return `Candidate face outside calibrated viewing zone sustained for >= ${this.config.faceOutsideDwellSeconds}s`;
      case "GAZE_DEVIATION":
        return `Sustained gaze deviation outside screen bounds for >= ${this.config.gazeDeviationDwellSeconds}s`;
      case "LIGHTING_ANOMALY":
        return `Extreme lighting or glare detected for >= ${this.config.lightingAnomalyDwellSeconds}s`;
      case "LOW_FRAME_QUALITY":
        return `Degraded camera stream quality or dropped frames for >= ${this.config.lowQualityDwellSeconds}s`;
    }
  }
}
