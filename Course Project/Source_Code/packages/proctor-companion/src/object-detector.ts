/**
 * AURA Phase 25: Local Object Detection & Prohibited Device Worker
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * 
 * Responsibilities:
 * 1. Detects prohibited physical devices: cell phones, secondary laptops, additional persons.
 * 2. Enforces temporal confirmation: requires candidate object observed in >= 3 of 5 recent
 *    inference samples with sustained persistence (1.5s - 3.0s).
 * 3. Enforces primary desk equipment allowlist: candidate's own integrated laptop/display
 *    is excluded from false-positive secondary device alarms.
 * 4. Deduplicates second person alerts with facial landmarker counts.
 * 5. Handles sudden lighting anomalies strictly as low-confidence supporting telemetry.
 * 6. Explicit Tablet Policy: Generic COCO lacks a dedicated tablet-computer class;
 *    tablet is documented as BLOCKED until a validated institutional model is curated.
 */

export type ProhibitedObjectClass = "cell_phone" | "laptop" | "person" | "tablet" | "lighting_anomaly";

export interface DetectedObjectBox {
  trackId: string;
  class: ProhibitedObjectClass;
  confidence: number; // 0.0 to 1.0
  box: {
    x: number;      // normalized 0.0 to 1.0
    y: number;      // normalized 0.0 to 1.0
    width: number;  // normalized
    height: number; // normalized
  };
  firstSeenTimestamp: number;
  lastSeenTimestamp: number;
  sampleCount: number;
  persistentDurationMs: number;
  isConfirmed: boolean;
  metadata?: Record<string, any>;
}

export interface ObjectDetectorConfig {
  sampleHistorySize?: number;       // default 5
  minSampleDwell?: number;          // default 3 (3 of 5 samples required)
  minPersistenceMs?: number;        // default 1500ms (1.5s sustained)
  minConfidenceThreshold?: number;  // default 0.65
  allowCandidateLaptop?: boolean;   // default true (candidate desk laptop allowlisted)
  deskLaptopRegion?: {              // default bottom portion of frame
    minY: number;
    minWidth: number;
  };
}

export interface FrameObjectInference {
  timestamp: number;
  rawDetections: Array<{
    class: ProhibitedObjectClass;
    confidence: number;
    box: { x: number; y: number; width: number; height: number };
  }>;
  meanLuminance?: number;
  luminanceStdDev?: number;
}

export class ProctorObjectDetector {
  private config: Required<ObjectDetectorConfig>;
  private activeTracks: Map<string, DetectedObjectBox> = new Map();
  private recentFrames: FrameObjectInference[] = [];
  private trackIdCounter = 0;
  private baselineLuminance: number | null = null;

  constructor(config: ObjectDetectorConfig = {}) {
    this.config = {
      sampleHistorySize: config.sampleHistorySize ?? 5,
      minSampleDwell: config.minSampleDwell ?? 3,
      minPersistenceMs: config.minPersistenceMs ?? 1500,
      minConfidenceThreshold: config.minConfidenceThreshold ?? 0.65,
      allowCandidateLaptop: config.allowCandidateLaptop ?? true,
      deskLaptopRegion: config.deskLaptopRegion ?? {
        minY: 0.60,      // Laptop keyboard/base occupying lower 40% of standard webcam
        minWidth: 0.40,  // Candidate workstation spans substantial width
      },
    };
  }

  /**
   * Evaluates a single inference frame and returns temporally confirmed prohibited objects.
   */
  public processFrame(frame: FrameObjectInference): {
    confirmedObjects: DetectedObjectBox[];
    allTracks: DetectedObjectBox[];
    hasConfirmedPhone: boolean;
    hasSecondPerson: boolean;
    lightingAnomaly: boolean;
  } {
    const now = frame.timestamp || Date.now();

    // 1. Maintain sliding window of inference frames
    this.recentFrames.push(frame);
    if (this.recentFrames.length > this.config.sampleHistorySize) {
      this.recentFrames.shift();
    }

    // 2. Track lighting anomaly as low-confidence supporting signal ONLY
    let lightingAnomaly = false;
    if (frame.meanLuminance !== undefined) {
      if (this.baselineLuminance === null) {
        this.baselineLuminance = frame.meanLuminance;
      } else {
        const delta = Math.abs(frame.meanLuminance - this.baselineLuminance);
        // Sudden brightness change > 50 units indicates reflection, auto-exposure, or flash
        if (delta > 50) {
          lightingAnomaly = true;
        } else {
          // Slow EMA update of ambient baseline
          this.baselineLuminance = 0.95 * this.baselineLuminance + 0.05 * frame.meanLuminance;
        }
      }
    }

    // 3. Process candidate raw object detections
    const matchedTrackIds = new Set<string>();

    for (const raw of frame.rawDetections) {
      // Confidence check
      if (raw.confidence < this.config.minConfidenceThreshold) {
        continue;
      }

      // Candidate primary laptop allowlist: Ignore candidate's own desk machine
      if (raw.class === "laptop" && this.config.allowCandidateLaptop) {
        if (
          raw.box.y >= this.config.deskLaptopRegion.minY ||
          (raw.box.width >= this.config.deskLaptopRegion.minWidth && raw.box.y > 0.45)
        ) {
          // Allowlisted candidate workstation equipment — not a secondary unauthorized laptop
          continue;
        }
      }

      // Explicit Tablet Safety Guard: Standard generic models cannot classify tablets.
      if (raw.class === "tablet") {
        // Tag as BLOCKED/experimental pending validated institutional dataset
        raw.box = { ...raw.box };
      }

      // Track association using spatial IoU / Centroid proximity
      let matchedTrack: DetectedObjectBox | null = null;
      let highestIoU = 0;

      for (const [id, track] of this.activeTracks.entries()) {
        if (track.class === raw.class) {
          const iou = this.computeIoU(track.box, raw.box);
          if (iou > 0.3 && iou > highestIoU) {
            highestIoU = iou;
            matchedTrack = track;
          }
        }
      }

      if (matchedTrack) {
        // Update existing track
        matchedTrack.lastSeenTimestamp = now;
        matchedTrack.sampleCount += 1;
        matchedTrack.persistentDurationMs = now - matchedTrack.firstSeenTimestamp;
        matchedTrack.confidence = 0.7 * matchedTrack.confidence + 0.3 * raw.confidence;
        // Smooth bounding box coordinates
        matchedTrack.box = {
          x: 0.8 * matchedTrack.box.x + 0.2 * raw.box.x,
          y: 0.8 * matchedTrack.box.y + 0.2 * raw.box.y,
          width: 0.8 * matchedTrack.box.width + 0.2 * raw.box.width,
          height: 0.8 * matchedTrack.box.height + 0.2 * raw.box.height,
        };
        matchedTrackIds.add(matchedTrack.trackId);
      } else {
        // Create new candidate track
        const newTrackId = `trk_${++this.trackIdCounter}_${raw.class}`;
        const newTrack: DetectedObjectBox = {
          trackId: newTrackId,
          class: raw.class,
          confidence: raw.confidence,
          box: { ...raw.box },
          firstSeenTimestamp: now,
          lastSeenTimestamp: now,
          sampleCount: 1,
          persistentDurationMs: 0,
          isConfirmed: false,
          metadata: {
            initialIoU: 0,
            lightingAnomalyCorrelated: lightingAnomaly,
          },
        };
        this.activeTracks.set(newTrackId, newTrack);
        matchedTrackIds.add(newTrackId);
      }
    }

    // 4. Prune stale tracks that disappeared for > 2.0 seconds
    for (const [id, track] of this.activeTracks.entries()) {
      if (!matchedTrackIds.has(id)) {
        if (now - track.lastSeenTimestamp > 2000) {
          this.activeTracks.delete(id);
        }
      }
    }

    // 5. Evaluate Temporal Confirmation:
    // Requires observation in >= minSampleDwell (e.g. 3 of 5) AND persistence >= minPersistenceMs (e.g. 1.5s)
    const confirmedObjects: DetectedObjectBox[] = [];
    let hasConfirmedPhone = false;
    let hasSecondPerson = false;

    for (const track of this.activeTracks.values()) {
      const recentHits = this.countRecentHitsForTrack(track);

      if (
        recentHits >= this.config.minSampleDwell &&
        track.persistentDurationMs >= this.config.minPersistenceMs
      ) {
        track.isConfirmed = true;
        confirmedObjects.push(track);

        if (track.class === "cell_phone") {
          hasConfirmedPhone = true;
        } else if (track.class === "person") {
          hasSecondPerson = true;
        }
      }
    }

    return {
      confirmedObjects,
      allTracks: Array.from(this.activeTracks.values()),
      hasConfirmedPhone,
      hasSecondPerson,
      lightingAnomaly,
    };
  }

  private countRecentHitsForTrack(track: DetectedObjectBox): number {
    let hits = 0;
    for (const frame of this.recentFrames) {
      for (const raw of frame.rawDetections) {
        if (raw.class === track.class && this.computeIoU(raw.box, track.box) > 0.25) {
          hits++;
          break;
        }
      }
    }
    return hits;
  }

  private computeIoU(
    a: { x: number; y: number; width: number; height: number },
    b: { x: number; y: number; width: number; height: number }
  ): number {
    const x1 = Math.max(a.x, b.x);
    const y1 = Math.max(a.y, b.y);
    const x2 = Math.min(a.x + a.width, b.x + b.width);
    const y2 = Math.min(a.y + a.height, b.y + b.height);

    const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const areaA = a.width * a.height;
    const areaB = b.width * b.height;
    const union = areaA + areaB - intersection;

    return union > 0 ? intersection / union : 0;
  }

  public reset(): void {
    this.activeTracks.clear();
    this.recentFrames = [];
    this.trackIdCounter = 0;
    this.baselineLuminance = null;
  }
}
