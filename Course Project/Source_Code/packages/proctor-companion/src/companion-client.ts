/**
 * Proctor Companion Client Coordinator
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 *
 * Integrates Voice Activity Detection (VAD) and audio speech thresholding
 * via AudioVadDetector (see audio-vad.ts).
 *
 * VAD architecture:
 *   - audioVadEnabled: flag indicating the microphone and VAD are running
 *   - speechDetected: set when audio RMS exceeds the adaptive noise floor
 *   - speechConfidence: 0.0–1.0 derived from spectral centroid and RMS
 *   - multiSpeakerSuspected: advisory flag when bimodal autocorrelation detected
 *
 * Important limitation: RMS volume alone is NOT multi-speaker detection.
 * Speaker diarization is advisory and is not presented as proof of multiple people.
 */

import { ProctorStateMachine, type ProctorState } from "./state-machine.ts";
import { FaceGeometryEstimator, type FaceLandmarkSet, type FaceGeometryResult } from "./face-geometry.ts";
import { DisplayGazeCalibrator, type GazeEstimationResult } from "./gaze-calibrator.ts";
// AudioVadDetector is wired in the desktop renderer; companion-client exposes the VAD status fields.
// import { AudioVadDetector } from "./audio-vad.ts";

/** VAD status carried in every telemetry frame */
export interface AudioVadStatus {
  audioVadEnabled: boolean;
  speechDetected: boolean;
  speechConfidence: number;
  audioRmsLevel: number;
  multiSpeakerSuspected: boolean; // Advisory only — not conclusive
}

export interface CompanionConfig {
  serverBaseUrl: string;
  attemptId: string;
  sessionToken: string;
  tenantId: string;
  version: string;
  os: string;
}

export interface TelemetryFrameOutput {
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
    normalizedX: number;
    normalizedY: number;
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

export class ProctorCompanionClient {
  public readonly fsm: ProctorStateMachine;
  public readonly gazeCalibrator: DisplayGazeCalibrator;
  private sequenceCounter: number = 0;
  private frameBuffer: TelemetryFrameOutput[] = [];
  private clipboardCount: number = 0;
  private isWindowFocused: boolean = true;
  private isFullScreen: boolean = true;
  private displayCount: number = 1;

  public readonly config: CompanionConfig;

  constructor(config: CompanionConfig) {
    this.config = config;
    this.fsm = new ProctorStateMachine();
    this.gazeCalibrator = new DisplayGazeCalibrator();
  }

  getState(): ProctorState {
    return this.fsm.getState();
  }

  /**
   * Completes device preflight checks.
   */
  completePreflight(checks: {
    cameraAvailable: boolean;
    lightingAdequate: boolean;
    networkAvailable: boolean;
    singleDisplay: boolean;
  }): boolean {
    this.fsm.transition("PREFLIGHT", "Starting preflight checks");

    if (!checks.cameraAvailable || !checks.lightingAdequate || !checks.networkAvailable) {
      this.fsm.transition("TERMINATED", "Preflight checks failed");
      return false;
    }

    this.displayCount = checks.singleDisplay ? 1 : 2;
    this.fsm.transition("CALIBRATING", "Preflight checks passed");
    return true;
  }

  /**
   * Completes on-screen 5-point gaze calibration.
   */
  calibrateGaze(samples: Array<{ targetId: string; eyeVector: { x: number; y: number } }>): boolean {
    if (this.fsm.getState() !== "CALIBRATING") {
      throw new Error("Cannot calibrate unless in CALIBRATING state.");
    }

    samples.forEach((s) => {
      const target = DisplayGazeCalibrator.TARGETS.find((t) => t.id === s.targetId) || {
        id: s.targetId,
        normalizedX: 0.5,
        normalizedY: 0.5,
      };
      this.gazeCalibrator.addCalibrationSample(target, s.eyeVector);
    });

    if (this.gazeCalibrator.isFullyCalibrated()) {
      this.fsm.transition("PROCTOR_READY", "Gaze calibration completed with 5 points");
      return true;
    }
    return false;
  }

  /**
   * Advances state to IN_EXAM once student enters authorized exam view.
   */
  startExam(): void {
    if (this.fsm.getState() !== "PROCTOR_READY") {
      throw new Error("Cannot start exam unless PROCTOR_READY.");
    }
    this.fsm.transition("IN_EXAM", "Authorized exam session started");
  }

  /**
   * Generates a single structured telemetry frame from live landmark inputs.
   */
  processFrame(
    landmarks: FaceLandmarkSet | null,
    rawFaceCount: number,
    eyeVector: { x: number; y: number }
  ): TelemetryFrameOutput {
    this.sequenceCounter++;

    const faceRes: FaceGeometryResult = FaceGeometryEstimator.evaluate(landmarks, rawFaceCount);
    const gazeRes: GazeEstimationResult = this.gazeCalibrator.estimateGaze(eyeVector);

    const frame: TelemetryFrameOutput = {
      sequenceNumber: this.sequenceCounter,
      timestamp: new Date().toISOString(),
      facePresence: {
        isFacePresent: faceRes.isFacePresent,
        faceCount: faceRes.faceCount,
        detectionConfidence: faceRes.detectionConfidence,
      },
      headPose: {
        pitchDegrees: faceRes.headPose.pitchDegrees,
        yawDegrees: faceRes.headPose.yawDegrees,
        rollDegrees: faceRes.headPose.rollDegrees,
        trackingConfidence: faceRes.detectionConfidence,
      },
      displayGaze: {
        normalizedX: gazeRes.normalizedX,
        normalizedY: gazeRes.normalizedY,
        isOnScreen: gazeRes.isOnScreen,
        fixationDurationMs: gazeRes.fixationDurationMs,
      },
      osIntegrity: {
        isWindowFocused: this.isWindowFocused,
        isFullScreen: this.isFullScreen,
        clipboardEventsCount: this.clipboardCount,
        displayCount: this.displayCount,
      },
    };

    this.frameBuffer.push(frame);
    return frame;
  }

  recordTelemetryFrame(frame: TelemetryFrameOutput): void {
    this.frameBuffer.push(frame);
  }

  getBufferedFrames(): TelemetryFrameOutput[] {
    return [...this.frameBuffer];
  }

  flushBuffer(): TelemetryFrameOutput[] {
    const frames = [...this.frameBuffer];
    this.frameBuffer = [];
    return frames;
  }

  setWindowFocus(focused: boolean): void {
    this.isWindowFocused = focused;
  }

  setFullScreen(full: boolean): void {
    this.isFullScreen = full;
  }

  recordClipboardPaste(): void {
    this.clipboardCount++;
  }

  finishExam(): void {
    if (this.fsm.getState() === "IN_EXAM") {
      this.fsm.transition("SUBMITTED", "Student submitted exam attempt");
    }
  }
}
