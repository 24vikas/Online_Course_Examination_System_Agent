import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProctorObjectDetector } from "../src/object-detector.ts";
import type { FrameObjectInference } from "../src/object-detector.ts";
import { IncidentDetector } from "../src/incident-detector.ts";
import { DisplayGazeCalibrator } from "../src/gaze-calibrator.ts";

describe("Phase 25 Prohibited Object Detector & Viewing Zone", () => {
  let detector: ProctorObjectDetector;
  let incidentDetector: IncidentDetector;
  let calibrator: DisplayGazeCalibrator;

  beforeEach(() => {
    detector = new ProctorObjectDetector({
      minConfidenceThreshold: 0.5,
      minPersistenceMs: 1500,
      minSampleDwell: 3,
      sampleHistorySize: 5,
    });
    incidentDetector = new IncidentDetector();
    calibrator = new DisplayGazeCalibrator();
  });

  test("should ignore single transient detections (glitches < 3 samples)", () => {
    const singleFrame: FrameObjectInference = {
      timestamp: 1000,
      rawDetections: [
        {
          class: "cell_phone",
          confidence: 0.88,
          box: { x: 0.2, y: 0.2, width: 0.1, height: 0.15 },
        },
      ],
    };

    // Sample 1 at t=1000ms
    let result = detector.processFrame(singleFrame);
    assert.equal(result.confirmedObjects.length, 0);
    assert.equal(result.allTracks.length, 1);
    assert.equal(result.allTracks[0].isConfirmed, false);

    // Sample 2 at t=1500ms - detection missing
    result = detector.processFrame({ timestamp: 1500, rawDetections: [] });
    assert.equal(result.confirmedObjects.length, 0);
  });

  test("should confirm prohibited phone detection when sustained for >= 3 samples and 1.5s", () => {
    const phoneBox = { x: 0.3, y: 0.4, width: 0.12, height: 0.2 };

    // Sample 1 at t=1000ms
    detector.processFrame({
      timestamp: 1000,
      rawDetections: [{ class: "cell_phone", confidence: 0.85, box: phoneBox }],
    });
    // Sample 2 at t=1600ms
    detector.processFrame({
      timestamp: 1600,
      rawDetections: [{ class: "cell_phone", confidence: 0.88, box: phoneBox }],
    });
    // Sample 3 at t=2200ms (duration 1200ms < 1500ms)
    let res3 = detector.processFrame({
      timestamp: 2200,
      rawDetections: [{ class: "cell_phone", confidence: 0.90, box: phoneBox }],
    });
    assert.equal(res3.confirmedObjects.length, 0); // Not yet 1500ms

    // Sample 4 at t=2600ms (duration 1600ms >= 1500ms AND 4 hits >= 3)
    let res4 = detector.processFrame({
      timestamp: 2600,
      rawDetections: [{ class: "cell_phone", confidence: 0.92, box: phoneBox }],
    });
    assert.equal(res4.confirmedObjects.length, 1);
    assert.equal(res4.confirmedObjects[0].class, "cell_phone");
    assert.equal(res4.hasConfirmedPhone, true);
  });

  test("should respect candidate desk laptop allowlist and ignore official testing laptop", () => {
    // Official laptop located at lower part of camera frame (y: 0.65, width: 0.5)
    const deskLaptopDetections: FrameObjectInference = {
      timestamp: 1000,
      rawDetections: [
        {
          class: "laptop",
          confidence: 0.95,
          box: { x: 0.2, y: 0.65, width: 0.6, height: 0.3 },
        },
      ],
    };

    // Send 5 consecutive frames across 2.5 seconds
    detector.processFrame({ ...deskLaptopDetections, timestamp: 1000 });
    detector.processFrame({ ...deskLaptopDetections, timestamp: 1600 });
    detector.processFrame({ ...deskLaptopDetections, timestamp: 2200 });
    detector.processFrame({ ...deskLaptopDetections, timestamp: 2800 });
    const res = detector.processFrame({ ...deskLaptopDetections, timestamp: 3500 });

    // Must be ignored because it is within the candidate desk region (y >= 0.60)
    assert.equal(res.confirmedObjects.length, 0);
  });

  test("should flag a secondary laptop placed elsewhere in the room outside allowlist", () => {
    // Secondary laptop placed in upper room background (y: 0.1, width: 0.25)
    const secondaryLaptopFrame: FrameObjectInference = {
      timestamp: 1000,
      rawDetections: [
        {
          class: "laptop",
          confidence: 0.91,
          box: { x: 0.7, y: 0.1, width: 0.25, height: 0.25 },
        },
      ],
    };

    detector.processFrame({ ...secondaryLaptopFrame, timestamp: 1000 });
    detector.processFrame({ ...secondaryLaptopFrame, timestamp: 1600 });
    detector.processFrame({ ...secondaryLaptopFrame, timestamp: 2200 });
    const res = detector.processFrame({ ...secondaryLaptopFrame, timestamp: 2800 });

    assert.equal(res.confirmedObjects.length, 1);
    assert.equal(res.confirmedObjects[0].class, "laptop");
  });

  test("should generate lighting anomaly telemetry without triggering critical escalation", () => {
    // Establish baseline at mean 120
    detector.processFrame({ timestamp: 1000, rawDetections: [], meanLuminance: 120 });
    // Flash / glare jumps to 220 (delta 100 > 50)
    const res = detector.processFrame({ timestamp: 1500, rawDetections: [], meanLuminance: 220 });
    assert.equal(res.lightingAnomaly, true);

    // Pass lighting anomaly into incident detector
    incidentDetector.step(1.0, { lightingAnomaly: true });
    // Dwell for lighting anomaly is 2.0s
    const incRes2 = incidentDetector.step(3.5, { lightingAnomaly: true });
    assert.equal(incRes2.newEvents.length, 1);
    assert.equal(incRes2.newEvents[0].type, "LIGHTING_ANOMALY");
    // Lighting anomaly must be LOW severity
    assert.equal(incRes2.newEvents[0].severity, "LOW");
  });

  test("should calibrate baseline from 5-point targets and compute allowed margins", () => {
    calibrator.startPreflightCalibration(20000);

    // Simulate 5 calibration points
    for (const target of DisplayGazeCalibrator.TARGETS) {
      calibrator.addCalibrationSample(
        target,
        { x: target.normalizedX * 0.1, y: target.normalizedY * 0.1 },
        { yaw: (target.normalizedX - 0.5) * 10, pitch: (target.normalizedY - 0.5) * 8, roll: 0 }
      );
    }

    assert.equal(calibrator.isFullyCalibrated(), true);
    const stats = calibrator.getBaselineStats();
    assert.ok(stats !== null);
    assert.ok(stats!.allowedYawMin < stats!.medianYaw);
    assert.ok(stats!.allowedYawMax > stats!.medianYaw);

    // Normal head pose inside viewing zone
    const checkInside = calibrator.checkViewingZone({ yaw: 2.0, pitch: -3.0, roll: 0 }, { x: 0.05, y: 0.05 });
    assert.equal(checkInside.isInside, true);

    // Significant yaw excursion (> 30 deg)
    const checkYawOut = calibrator.checkViewingZone({ yaw: 35.0, pitch: 0.0, roll: 0 }, { x: 0.05, y: 0.05 });
    assert.equal(checkYawOut.isInside, false);
    assert.equal(checkYawOut.yawExcursion, true);

    // Downward pitch reading scratch paper with PITCH_DOWN_ALLOWED = true
    const checkScratch = calibrator.checkViewingZone({ yaw: 0.0, pitch: -28.0, roll: 0 }, { x: 0.05, y: 0.05 }, true);
    assert.equal(checkScratch.pitchExcursion, false);

    // Downward pitch reading scratch paper with PITCH_DOWN_ALLOWED = false
    const checkScratchForbidden = calibrator.checkViewingZone({ yaw: 0.0, pitch: -28.0, roll: 0 }, { x: 0.05, y: 0.05 }, false);
    assert.equal(checkScratchForbidden.pitchExcursion, true);
  });
});
