/**
 * Calibrated Display Gaze & Viewing-Zone Estimator
 * Maps eye landmark features to normalized [0.0, 1.0] display coordinates
 * and provides robust Median/MAD-based viewing-zone boundary calibration.
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 *
 * MediaPipe Iris Landmark Indices (478-landmark model):
 *   Left iris:  468 (center), 469 (right), 470 (top), 471 (left), 472 (bottom)
 *   Right iris: 473 (center), 474 (right), 475 (top), 476 (left), 477 (bottom)
 */

/** Iris landmark index constants for MediaPipe 478-point model */
export const IRIS_LANDMARK_INDICES = {
  LEFT_IRIS_CENTER: 468,
  LEFT_IRIS_RIGHT: 469,
  LEFT_IRIS_TOP: 470,
  LEFT_IRIS_LEFT: 471,
  LEFT_IRIS_BOTTOM: 472,
  RIGHT_IRIS_CENTER: 473,
  RIGHT_IRIS_RIGHT: 474,
  RIGHT_IRIS_TOP: 475,
  RIGHT_IRIS_LEFT: 476,
  RIGHT_IRIS_BOTTOM: 477,
} as const;

export interface ScreenTarget {
  id: string;
  normalizedX: number; // 0.0 to 1.0
  normalizedY: number; // 0.0 to 1.0
}

export interface CalibrationSample {
  target: ScreenTarget;
  eyeVector: { x: number; y: number };
  headPose?: { yaw: number; pitch: number; roll: number };
  faceBox?: { x: number; y: number; width: number; height: number };
  timestampMs?: number;
}

export interface RobustBaselineStats {
  medianYaw: number;
  madYaw: number;
  medianPitch: number;
  madPitch: number;
  medianRoll: number;
  madRoll: number;
  medianEyeX: number;
  madEyeX: number;
  medianEyeY: number;
  madEyeY: number;
  allowedYawMin: number;
  allowedYawMax: number;
  allowedPitchMin: number;
  allowedPitchMax: number;
}

export interface GazeEstimationResult {
  normalizedX: number;
  normalizedY: number;
  isOnScreen: boolean;
  fixationDurationMs: number;
  confidence: number;
}

export interface ViewingZoneCheckResult {
  isInside: boolean;
  yawExcursion: boolean;
  pitchExcursion: boolean;
  gazeExcursion: boolean;
  reason?: string;
  yaw: number;
  pitch: number;
}

export class DisplayGazeCalibrator {
  private calibrationSamples: CalibrationSample[] = [];
  private isCalibrated: boolean = false;
  private currentFixationStart: number = Date.now();
  private lastGazeState: boolean = true;
  private baselineStats: RobustBaselineStats | null = null;
  private preflightStartTime: number | null = null;
  private preflightDurationMs: number = 20000; // 20s preflight

  // Standard 5-point calibration targets
  public static readonly TARGETS: ScreenTarget[] = [
    { id: "CENTER", normalizedX: 0.5, normalizedY: 0.5 },
    { id: "TOP_LEFT", normalizedX: 0.1, normalizedY: 0.1 },
    { id: "TOP_RIGHT", normalizedX: 0.9, normalizedY: 0.1 },
    { id: "BOTTOM_LEFT", normalizedX: 0.1, normalizedY: 0.9 },
    { id: "BOTTOM_RIGHT", normalizedX: 0.9, normalizedY: 0.9 },
  ];

  public startPreflightCalibration(durationMs: number = 20000): void {
    this.reset();
    this.preflightStartTime = Date.now();
    this.preflightDurationMs = durationMs;
  }

  public getPreflightProgress(): { isCalibrating: boolean; progress: number; sampleCount: number; isComplete: boolean } {
    if (!this.preflightStartTime) {
      return { isCalibrating: false, progress: this.isCalibrated ? 1.0 : 0.0, sampleCount: this.calibrationSamples.length, isComplete: this.isCalibrated };
    }
    const elapsed = Date.now() - this.preflightStartTime;
    const progress = Math.min(1.0, elapsed / this.preflightDurationMs);
    const isComplete = progress >= 1.0 && this.calibrationSamples.length >= 5;
    if (isComplete && !this.isCalibrated) {
      this.finalizePreflight();
    }
    return {
      isCalibrating: progress < 1.0,
      progress: parseFloat(progress.toFixed(2)),
      sampleCount: this.calibrationSamples.length,
      isComplete,
    };
  }

  public addCalibrationSample(
    target: ScreenTarget,
    eyeVector: { x: number; y: number },
    headPose?: { yaw: number; pitch: number; roll: number },
    faceBox?: { x: number; y: number; width: number; height: number }
  ): void {
    this.calibrationSamples.push({
      target,
      eyeVector,
      headPose,
      faceBox,
      timestampMs: Date.now(),
    });

    if (this.calibrationSamples.length >= DisplayGazeCalibrator.TARGETS.length) {
      this.finalizePreflight();
    }
  }

  public finalizePreflight(): void {
    this.isCalibrated = true;
    this.preflightStartTime = null;
    this.computeBaselineStats();
  }

  public isFullyCalibrated(): boolean {
    return this.isCalibrated && this.calibrationSamples.length >= 5;
  }

  public getCalibrationQuality(): "EXCELLENT" | "GOOD" | "POOR" | "UNCALIBRATED" {
    if (!this.isCalibrated) return "UNCALIBRATED";
    if (this.calibrationSamples.length >= 5) return "EXCELLENT";
    return "GOOD";
  }

  public getBaselineStats(): RobustBaselineStats | null {
    return this.baselineStats;
  }

  /**
   * Helper: calculates median of array
   */
  private static calculateMedian(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * Helper: calculates Median Absolute Deviation (MAD)
   */
  private static calculateMAD(values: number[], median: number): number {
    if (values.length === 0) return 0;
    const deviations = values.map((v) => Math.abs(v - median));
    return DisplayGazeCalibrator.calculateMedian(deviations);
  }

  private computeBaselineStats(): void {
    const yaws: number[] = [];
    const pitches: number[] = [];
    const rolls: number[] = [];
    const eyeXs: number[] = [];
    const eyeYs: number[] = [];

    for (const s of this.calibrationSamples) {
      if (s.headPose) {
        yaws.push(s.headPose.yaw);
        pitches.push(s.headPose.pitch);
        rolls.push(s.headPose.roll);
      }
      eyeXs.push(s.eyeVector.x);
      eyeYs.push(s.eyeVector.y);
    }

    const medYaw = DisplayGazeCalibrator.calculateMedian(yaws);
    const madYaw = Math.max(1.5, DisplayGazeCalibrator.calculateMAD(yaws, medYaw));

    const medPitch = DisplayGazeCalibrator.calculateMedian(pitches);
    const madPitch = Math.max(1.5, DisplayGazeCalibrator.calculateMAD(pitches, medPitch));

    const medRoll = DisplayGazeCalibrator.calculateMedian(rolls);
    const madRoll = Math.max(1.5, DisplayGazeCalibrator.calculateMAD(rolls, medRoll));

    const medEyeX = DisplayGazeCalibrator.calculateMedian(eyeXs);
    const madEyeX = Math.max(0.01, DisplayGazeCalibrator.calculateMAD(eyeXs, medEyeX));

    const medEyeY = DisplayGazeCalibrator.calculateMedian(eyeYs);
    const madEyeY = Math.max(0.01, DisplayGazeCalibrator.calculateMAD(eyeYs, medEyeY));

    // Margins: baseline median +- (20 deg + 2.5 * MAD_yaw)
    const yawTolerance = 20.0 + 2.5 * madYaw;
    const pitchTolerance = 15.0 + 2.5 * madPitch;

    this.baselineStats = {
      medianYaw: medYaw,
      madYaw,
      medianPitch: medPitch,
      madPitch,
      medianRoll: medRoll,
      madRoll,
      medianEyeX: medEyeX,
      madEyeX,
      medianEyeY: medEyeY,
      madEyeY,
      allowedYawMin: medYaw - yawTolerance,
      allowedYawMax: medYaw + yawTolerance,
      allowedPitchMin: medPitch - pitchTolerance,
      allowedPitchMax: medPitch + pitchTolerance,
    };
  }

  /**
   * Projects raw eye vector into normalized display coordinates [0.0, 1.0].
   */
  public estimateGaze(eyeVector: { x: number; y: number }): GazeEstimationResult {
    // If not yet calibrated, default to centered estimate with lower confidence
    if (!this.isCalibrated || this.calibrationSamples.length === 0) {
      return {
        normalizedX: 0.5,
        normalizedY: 0.5,
        isOnScreen: true,
        fixationDurationMs: 0,
        confidence: 0.5,
      };
    }

    // Centroid baseline from calibration samples
    const centerSample = this.calibrationSamples.find((s) => s.target.id === "CENTER") || this.calibrationSamples[0];
    const dx = eyeVector.x - centerSample.eyeVector.x;
    const dy = eyeVector.y - centerSample.eyeVector.y;

    // Scale displacement to normalized display coordinates
    const scale = 2.0;
    const normX = Math.max(-0.5, Math.min(1.5, 0.5 + dx * scale));
    const normY = Math.max(-0.5, Math.min(1.5, 0.5 + dy * scale));

    // Screen boundary check (with 10% outer margin tolerance)
    const isOnScreen = normX >= -0.10 && normX <= 1.10 && normY >= -0.10 && normY <= 1.10;

    // Track fixation duration
    const now = Date.now();
    if (isOnScreen !== this.lastGazeState) {
      this.lastGazeState = isOnScreen;
      this.currentFixationStart = now;
    }
    const fixationDurationMs = now - this.currentFixationStart;

    return {
      normalizedX: parseFloat(normX.toFixed(3)),
      normalizedY: parseFloat(normY.toFixed(3)),
      isOnScreen,
      fixationDurationMs,
      confidence: 0.92,
    };
  }

  /**
   * Checks whether the current head pose and gaze fall inside the calibrated viewing zone.
   * Supports PITCH_DOWN_ALLOWED (reading scratch paper).
   */
  public checkViewingZone(
    headPose: { yaw: number; pitch: number; roll: number },
    gaze: { x: number; y: number },
    pitchDownAllowed: boolean = true
  ): ViewingZoneCheckResult {
    if (!this.isCalibrated || !this.baselineStats) {
      // Uncalibrated defaults: standard +-25 yaw, +-20 pitch
      const yawExcursion = Math.abs(headPose.yaw) > 25;
      const pitchExcursion = pitchDownAllowed ? headPose.pitch < -30 : Math.abs(headPose.pitch) > 20;
      return {
        isInside: !yawExcursion && !pitchExcursion,
        yawExcursion,
        pitchExcursion,
        gazeExcursion: false,
        yaw: headPose.yaw,
        pitch: headPose.pitch,
      };
    }

    const { allowedYawMin, allowedYawMax, allowedPitchMin, allowedPitchMax } = this.baselineStats;
    const yawExcursion = headPose.yaw < allowedYawMin || headPose.yaw > allowedYawMax;

    // If scratch paper reading is permitted, pitch downwards has an extra margin (down to -35 deg)
    const effectivePitchMin = pitchDownAllowed ? Math.min(allowedPitchMin, -35.0) : allowedPitchMin;
    const pitchExcursion = headPose.pitch < effectivePitchMin || headPose.pitch > allowedPitchMax;

    // Gaze excursion check
    const gazeResult = this.estimateGaze(gaze);
    const gazeExcursion = !gazeResult.isOnScreen;

    const isInside = !yawExcursion && !pitchExcursion && !gazeExcursion;
    let reason: string | undefined;
    if (!isInside) {
      const parts: string[] = [];
      if (yawExcursion) parts.push(`Yaw excursion (${headPose.yaw.toFixed(1)}° ∉ [${allowedYawMin.toFixed(1)}°, ${allowedYawMax.toFixed(1)}°])`);
      if (pitchExcursion) parts.push(`Pitch excursion (${headPose.pitch.toFixed(1)}° ∉ [${effectivePitchMin.toFixed(1)}°, ${allowedPitchMax.toFixed(1)}°])`);
      if (gazeExcursion) parts.push(`Gaze off-screen (${gazeResult.normalizedX}, ${gazeResult.normalizedY})`);
      reason = parts.join("; ");
    }

    return {
      isInside,
      yawExcursion,
      pitchExcursion,
      gazeExcursion,
      reason,
      yaw: headPose.yaw,
      pitch: headPose.pitch,
    };
  }

  public reset(): void {
    this.calibrationSamples = [];
    this.isCalibrated = false;
    this.baselineStats = null;
    this.preflightStartTime = null;
    this.currentFixationStart = Date.now();
    this.lastGazeState = true;
  }
}
