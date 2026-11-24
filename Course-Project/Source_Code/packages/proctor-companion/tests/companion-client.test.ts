/**
 * Proctor Companion Host Client Test Suite
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ProctorStateMachine,
  FaceGeometryEstimator,
  DisplayGazeCalibrator,
  ProctorCompanionClient,
} from "../src/index.ts";

test("Proctor Companion: State machine enforces valid lifecycle and rejects invalid jumps", () => {
  const fsm = new ProctorStateMachine();
  assert.equal(fsm.getState(), "IDLE");

  // Invalid transition from IDLE to IN_EXAM directly
  assert.throws(() => {
    fsm.transition("IN_EXAM");
  }, /INVALID_STATE_TRANSITION/);

  // Valid forward journey
  fsm.transition("PREFLIGHT");
  assert.equal(fsm.getState(), "PREFLIGHT");

  fsm.transition("CALIBRATING");
  assert.equal(fsm.getState(), "CALIBRATING");

  fsm.transition("PROCTOR_READY");
  assert.equal(fsm.getState(), "PROCTOR_READY");

  fsm.transition("IN_EXAM");
  assert.equal(fsm.getState(), "IN_EXAM");

  fsm.transition("SUBMITTED");
  assert.equal(fsm.getState(), "SUBMITTED");

  fsm.transition("IDLE");
  assert.equal(fsm.getState(), "IDLE");
});

test("Proctor Companion: Face geometry estimator calculates head pose Euler angles accurately", () => {
  // Centered face landmarks
  const centerLandmarks = {
    noseTip: { x: 0.5, y: 0.5, z: 0.0 },
    chin: { x: 0.5, y: 0.8, z: 0.0 },
    leftEyeOuter: { x: 0.35, y: 0.35, z: 0.0 },
    rightEyeOuter: { x: 0.65, y: 0.35, z: 0.0 },
    leftMouthCorner: { x: 0.4, y: 0.65, z: 0.0 },
    rightMouthCorner: { x: 0.6, y: 0.65, z: 0.0 },
  };

  const centerEval = FaceGeometryEstimator.evaluate(centerLandmarks, 1);
  assert.equal(centerEval.isFacePresent, true);
  assert.equal(centerEval.faceCount, 1);
  assert.equal(centerEval.isPoseNormal, true);
  assert.equal(centerEval.headPose.yawDegrees, 0);

  // Turned head (yaw > 35 degrees)
  const turnedLandmarks = {
    ...centerLandmarks,
    noseTip: { x: 0.63, y: 0.5, z: 0.0 }, // shifted right
  };
  const turnedEval = FaceGeometryEstimator.evaluate(turnedLandmarks, 1);
  assert.ok(turnedEval.headPose.yawDegrees > 35, "Yaw must be > 35 when nose deviates significantly");
  assert.equal(turnedEval.isPoseNormal, false);
});

test("Proctor Companion: Display gaze calibrator maps 5-point calibration targets to screen coordinates", () => {
  const calibrator = new DisplayGazeCalibrator();
  assert.equal(calibrator.isFullyCalibrated(), false);
  assert.equal(calibrator.getCalibrationQuality(), "UNCALIBRATED");

  // Feed 5 calibration target samples
  const samples = [
    { target: DisplayGazeCalibrator.TARGETS[0], eyeVector: { x: 0.0, y: 0.0 } }, // Center
    { target: DisplayGazeCalibrator.TARGETS[1], eyeVector: { x: -0.2, y: -0.2 } }, // Top-Left
    { target: DisplayGazeCalibrator.TARGETS[2], eyeVector: { x: 0.2, y: -0.2 } }, // Top-Right
    { target: DisplayGazeCalibrator.TARGETS[3], eyeVector: { x: -0.2, y: 0.2 } }, // Bottom-Left
    { target: DisplayGazeCalibrator.TARGETS[4], eyeVector: { x: 0.2, y: 0.2 } }, // Bottom-Right
  ];

  samples.forEach((s) => calibrator.addCalibrationSample(s.target, s.eyeVector));

  assert.equal(calibrator.isFullyCalibrated(), true);
  assert.equal(calibrator.getCalibrationQuality(), "EXCELLENT");

  // Center gaze estimate
  const centerGaze = calibrator.estimateGaze({ x: 0.0, y: 0.0 });
  assert.equal(centerGaze.normalizedX, 0.5);
  assert.equal(centerGaze.normalizedY, 0.5);
  assert.equal(centerGaze.isOnScreen, true);

  // Extreme excursion gaze estimate
  const offScreenGaze = calibrator.estimateGaze({ x: 0.8, y: 0.0 });
  assert.ok(offScreenGaze.normalizedX > 1.05);
  assert.equal(offScreenGaze.isOnScreen, false);
});

test("Proctor Companion: Full client workflow from preflight to telemetry emission", () => {
  const client = new ProctorCompanionClient({
    serverBaseUrl: "http://localhost:3000",
    attemptId: "attempt-test-101",
    sessionToken: "scoped-test-token",
    tenantId: "tenant-kle-tech",
    version: "1.0.0",
    os: "linux-x64",
  });

  assert.equal(client.getState(), "IDLE");

  // 1. Preflight
  const preflightOk = client.completePreflight({
    cameraAvailable: true,
    lightingAdequate: true,
    networkAvailable: true,
    singleDisplay: true,
  });
  assert.equal(preflightOk, true);
  assert.equal(client.getState(), "CALIBRATING");

  // 2. Gaze calibration
  const calibrated = client.calibrateGaze([
    { targetId: "CENTER", eyeVector: { x: 0.0, y: 0.0 } },
    { targetId: "TOP_LEFT", eyeVector: { x: -0.2, y: -0.2 } },
    { targetId: "TOP_RIGHT", eyeVector: { x: 0.2, y: -0.2 } },
    { targetId: "BOTTOM_LEFT", eyeVector: { x: -0.2, y: 0.2 } },
    { targetId: "BOTTOM_RIGHT", eyeVector: { x: 0.2, y: 0.2 } },
  ]);
  assert.equal(calibrated, true);
  assert.equal(client.getState(), "PROCTOR_READY");

  // 3. Start Exam
  client.startExam();
  assert.equal(client.getState(), "IN_EXAM");

  // 4. Process frames and verify monotonic sequence
  const centerLandmarks = {
    noseTip: { x: 0.5, y: 0.5, z: 0.0 },
    chin: { x: 0.5, y: 0.8, z: 0.0 },
    leftEyeOuter: { x: 0.35, y: 0.35, z: 0.0 },
    rightEyeOuter: { x: 0.65, y: 0.35, z: 0.0 },
    leftMouthCorner: { x: 0.4, y: 0.65, z: 0.0 },
    rightMouthCorner: { x: 0.6, y: 0.65, z: 0.0 },
  };

  const f1 = client.processFrame(centerLandmarks, 1, { x: 0.0, y: 0.0 });
  const f2 = client.processFrame(centerLandmarks, 1, { x: 0.01, y: 0.01 });

  assert.equal(f1.sequenceNumber, 1);
  assert.equal(f2.sequenceNumber, 2);
  assert.equal(f1.facePresence.isFacePresent, true);
  assert.equal(f1.displayGaze.isOnScreen, true);

  // 5. Buffer flush
  const buffered = client.flushBuffer();
  assert.equal(buffered.length, 2);
  assert.equal(client.getBufferedFrames().length, 0);

  // 6. Finish Exam
  client.finishExam();
  assert.equal(client.getState(), "SUBMITTED");
});

test("Proctor Companion: CameraPipeline initializes gracefully with simulated edge fallback", async () => {
  const { CameraPipeline } = await import("../src/camera-pipeline.ts");
  const pipeline = new CameraPipeline({ enableVirtualFallback: true });

  const initResult = await pipeline.initialize();
  assert.equal(pipeline.getIsRunning(), true);
  assert.equal(initResult.isVirtual, true); // Headless test environment defaults to virtual stream

  const frame1 = pipeline.processFrame();
  assert.ok(frame1.timestamp);
  assert.equal(frame1.isVirtualStream, true);
  assert.equal(frame1.geometry.isFacePresent, true);
  assert.equal(frame1.geometry.isPoseNormal, true);
  assert.equal(frame1.lightingQuality, "ADEQUATE");

  // Verify multiple frames produce sequential variation without NaN
  const frame2 = pipeline.processFrame();
  assert.ok(!isNaN(frame2.geometry.headPose.yawDegrees));
  assert.ok(!isNaN(frame2.geometry.headPose.pitchDegrees));
  assert.ok(!isNaN(frame2.irisGaze.normalizedX));

  pipeline.stop();
  assert.equal(pipeline.getIsRunning(), false);
});
