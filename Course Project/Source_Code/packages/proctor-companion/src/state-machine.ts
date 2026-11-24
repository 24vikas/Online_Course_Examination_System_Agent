/**
 * Finite State Machine for Proctor Companion Lifecycle
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 * 
 * Supports Phase 24 Section 2.1 Authoritative States:
 * NOT_CONNECTED, DEVICE_CHECK, CALIBRATING, READY, MONITORING,
 * WARNING, CONNECTION_LOST, STOPPED, ERROR.
 *
 * Face Incident Types supported:
 *   MULTIPLE_FACES  — faceCount > 1 sustained beyond dwell threshold
 *   FACE_MISSING    — faceCount == 0 sustained beyond dwell threshold
 *   GAZE_DEVIATION  — normalized gaze deviates from screen center zone
 *   HEAD_POSE_DEVIATION — head yaw/pitch exceeds configured thresholds
 */

export type ProctorState =
  | "NOT_CONNECTED"
  | "DEVICE_CHECK"
  | "CALIBRATING"
  | "READY"
  | "MONITORING"
  | "WARNING"
  | "CONNECTION_LOST"
  | "STOPPED"
  | "ERROR"
  // Backward compatibility aliases
  | "IDLE"
  | "PREFLIGHT"
  | "PROCTOR_READY"
  | "IN_EXAM"
  | "SUBMITTED"
  | "TERMINATED";

/** Canonical incident event types evaluated by the state machine */
export type IncidentEventType =
  | "MULTIPLE_FACES"
  | "FACE_MISSING"
  | "GAZE_DEVIATION"
  | "HEAD_POSE_DEVIATION"
  | "CAMERA_DISCONNECTED"
  | "CAMERA_FROZEN"
  | "CAMERA_BLOCKED"
  | "AUDIO_DEVICE_DISCONNECTED"
  | "VOICE_ACTIVITY"
  | "LOCKDOWN_VIOLATION";

export interface StateTransitionEvent {
  from: ProctorState;
  to: ProctorState;
  timestamp: string;
  reason?: string;
}

export interface FaceCountObservation {
  faceCount: number;
  timestamp: number;
}

export class ProctorStateMachine {
  private currentState: ProctorState = "IDLE";
  private history: StateTransitionEvent[] = [];
  private faceCountHistory: FaceCountObservation[] = [];

  /** Dwell-time threshold (ms) before a MULTIPLE_FACES observation becomes an incident */
  static readonly MULTIPLE_FACES_DWELL_MS = 2500;
  /** Dwell-time threshold (ms) before a FACE_MISSING observation becomes an incident */
  static readonly FACE_MISSING_DWELL_MS = 5000;

  private static VALID_TRANSITIONS: Record<string, string[]> = {
    IDLE: ["PREFLIGHT", "DEVICE_CHECK", "NOT_CONNECTED"],
    NOT_CONNECTED: ["DEVICE_CHECK", "ERROR", "PREFLIGHT", "IDLE"],
    DEVICE_CHECK: ["CALIBRATING", "READY", "ERROR", "NOT_CONNECTED"],
    PREFLIGHT: ["CALIBRATING", "READY", "ERROR", "TERMINATED"],
    CALIBRATING: ["READY", "DEVICE_CHECK", "PREFLIGHT", "ERROR", "PROCTOR_READY"],
    PROCTOR_READY: ["MONITORING", "IN_EXAM", "TERMINATED", "READY", "DEVICE_CHECK"],
    READY: ["MONITORING", "IN_EXAM", "CALIBRATING", "ERROR", "STOPPED", "DEVICE_CHECK"],
    MONITORING: ["WARNING", "CONNECTION_LOST", "STOPPED", "SUBMITTED", "TERMINATED", "READY"],
    IN_EXAM: ["WARNING", "CONNECTION_LOST", "STOPPED", "SUBMITTED", "TERMINATED", "MONITORING"],
    WARNING: ["MONITORING", "IN_EXAM", "CONNECTION_LOST", "STOPPED", "ERROR"],
    CONNECTION_LOST: ["MONITORING", "IN_EXAM", "WARNING", "STOPPED", "ERROR"],
    SUBMITTED: ["STOPPED", "NOT_CONNECTED", "IDLE"],
    STOPPED: ["NOT_CONNECTED", "DEVICE_CHECK", "IDLE"],
    TERMINATED: ["NOT_CONNECTED", "IDLE"],
    ERROR: ["DEVICE_CHECK", "NOT_CONNECTED", "IDLE"],
  };

  getState(): ProctorState {
    return this.currentState;
  }

  getHistory(): StateTransitionEvent[] {
    return [...this.history];
  }

  transition(to: ProctorState, reason?: string): ProctorState {
    const allowed = ProctorStateMachine.VALID_TRANSITIONS[this.currentState] || [];
    if (!allowed.includes(to)) {
      throw new Error(
        `INVALID_STATE_TRANSITION: Cannot transition from '${this.currentState}' to '${to}'. Allowed: [${allowed.join(", ")}]`
      );
    }

    const event: StateTransitionEvent = {
      from: this.currentState,
      to,
      timestamp: new Date().toISOString(),
      reason,
    };

    this.history.push(event);
    this.currentState = to;
    return this.currentState;
  }

  /**
   * Evaluates a new face count observation.
   * Returns the incident type if a dwell threshold has been crossed, or null.
   * Uses temporal smoothing — transient single-frame anomalies are filtered.
   */
  evaluateFaceCount(faceCount: number, nowMs: number = Date.now()): IncidentEventType | null {
    this.faceCountHistory.push({ faceCount, timestamp: nowMs });

    // Keep only observations from the last 10 seconds
    this.faceCountHistory = this.faceCountHistory.filter(
      (o) => nowMs - o.timestamp <= 10_000
    );

    // Check sustained MULTIPLE_FACES (faceCount > 1)
    if (faceCount > 1) {
      const dwellStart = this.faceCountHistory.find((o) => o.faceCount > 1);
      if (dwellStart && nowMs - dwellStart.timestamp >= ProctorStateMachine.MULTIPLE_FACES_DWELL_MS) {
        return "MULTIPLE_FACES";
      }
    }

    // Check sustained FACE_MISSING (faceCount == 0)
    if (faceCount === 0) {
      const dwellStart = this.faceCountHistory.find((o) => o.faceCount === 0);
      if (dwellStart && nowMs - dwellStart.timestamp >= ProctorStateMachine.FACE_MISSING_DWELL_MS) {
        return "FACE_MISSING";
      }
    }

    return null;
  }

  reset(): void {
    this.currentState = "IDLE";
    this.history = [];
    this.faceCountHistory = [];
  }
}
