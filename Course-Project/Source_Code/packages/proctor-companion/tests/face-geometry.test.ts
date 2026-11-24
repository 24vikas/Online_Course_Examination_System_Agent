/**
 * Comprehensive Face Geometry, 6-Point 3D PnP Head Pose, Iris Gaze & Kabsch Unit Tests
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FaceGeometryEstimator,
  CANONICAL_3D_HEAD_MODEL,
  type FaceLandmarkSet,
  type Point3D,
} from "../src/face-geometry.ts";

test("Face Geometry: 6-Point 3D solvePnP computes genuine Euler angles", () => {
  // Pinhole camera setup: 640x480
  const width = 640;
  const height = 480;

  // Case 1: Centered frontal face image points matching canonical 3D model
  // Canonical model: [1 (nose: 0,0,0), 152 (chin: 0,330,-65), 33 (left: -225,-170,-135), 263 (right: 225,-170,-135), 61 (-150,150,-125), 291 (150,150,-125)]
  const frontalImagePoints: [number, number][] = [
    [320.0, 240.0], // Nose tip center
    [320.0, 390.0], // Chin
    [210.0, 160.0], // Left eye
    [430.0, 160.0], // Right eye
    [245.0, 310.0], // Left mouth
    [395.0, 310.0], // Right mouth
  ];

  const result = FaceGeometryEstimator.solvePnP6Points(frontalImagePoints, width, height);
  assert.ok(result.pose, "solvePnP6Points must return pose");
  assert.ok(typeof result.pose.pitchDegrees === "number", "pitch must be number");
  assert.ok(typeof result.pose.yawDegrees === "number", "yaw must be number");
  assert.ok(typeof result.pose.rollDegrees === "number", "roll must be number");
  assert.ok(Number.isFinite(result.pose.pitchDegrees), "pitch must be finite");
  assert.ok(Number.isFinite(result.pose.yawDegrees), "yaw must be finite");
  assert.ok(Number.isFinite(result.pose.rollDegrees), "roll must be finite");

  // Frontal posture should be close to zero yaw/pitch/roll
  assert.ok(Math.abs(result.pose.yawDegrees) <= 15.0, `Frontal yaw must be near 0, got ${result.pose.yawDegrees}`);
  assert.ok(Math.abs(result.pose.rollDegrees) <= 15.0, `Frontal roll must be near 0, got ${result.pose.rollDegrees}`);
  assert.ok(result.reprojectionError < 0.25, `Reprojection error must be reasonable, got ${result.reprojectionError}`);

  // Case 2: Turned face (shifted nose tip to the right -> positive yaw)
  const turnedRightImagePoints: [number, number][] = [
    [360.0, 240.0], // Nose tip shifted right
    [335.0, 390.0],
    [220.0, 160.0],
    [420.0, 160.0],
    [260.0, 310.0],
    [390.0, 310.0],
  ];

  const turnedResult = FaceGeometryEstimator.solvePnP6Points(turnedRightImagePoints, width, height);
  assert.ok(turnedResult.pose.yawDegrees > 5.0, `Turned face yaw must be positive, got ${turnedResult.pose.yawDegrees}`);
});

test("Face Geometry: 468+ Mesh & Iris Landmarks with 3D Gaze Direction Vector", () => {
  const landmarks: FaceLandmarkSet = {
    noseTip: { x: 0.50, y: 0.52, z: 0.0 },
    chin: { x: 0.50, y: 0.80, z: -0.05 },
    leftEyeOuter: { x: 0.35, y: 0.38, z: -0.02 },
    rightEyeOuter: { x: 0.65, y: 0.38, z: -0.02 },
    leftMouthCorner: { x: 0.40, y: 0.68, z: -0.01 },
    rightMouthCorner: { x: 0.60, y: 0.68, z: -0.01 },
    // Iris landmarks (MediaPipe indices 468-472 left iris, 473-477 right iris)
    leftIrisCenter: { x: 0.3875, y: 0.38, z: -0.02 },
    rightIrisCenter: { x: 0.6125, y: 0.38, z: -0.02 },
    leftIrisPerimeter: [
      { x: 0.385, y: 0.375, z: -0.02 },
      { x: 0.395, y: 0.375, z: -0.02 },
      { x: 0.385, y: 0.385, z: -0.02 },
      { x: 0.395, y: 0.385, z: -0.02 },
    ],
    rightIrisPerimeter: [
      { x: 0.605, y: 0.375, z: -0.02 },
      { x: 0.615, y: 0.375, z: -0.02 },
      { x: 0.605, y: 0.385, z: -0.02 },
      { x: 0.615, y: 0.385, z: -0.02 },
    ],
  };

  const evaluation = FaceGeometryEstimator.evaluate(landmarks, 1);
  assert.equal(evaluation.isFacePresent, true);
  assert.equal(evaluation.faceCount, 1);
  assert.ok(evaluation.detectionConfidence >= 0.95);
  assert.ok(evaluation.boundingBox);
  assert.ok(evaluation.gazeVector);

  // Gaze vector properties
  const gaze = evaluation.gazeVector;
  assert.ok(typeof gaze.vectorX === "number");
  assert.ok(typeof gaze.vectorY === "number");
  assert.ok(typeof gaze.vectorZ === "number");
  assert.equal(gaze.isScreenFacing, true, "Centered gaze must be screen-facing");
  assert.equal(gaze.status, "SCREEN_FOCUSED");
  assert.ok(gaze.excursionConfidence >= 0.80);
});

test("Face Geometry: Kabsch Shape Residual Algorithm for Session Identity Continuity", () => {
  // Baseline 6 canonical facial points
  const baseline: Point3D[] = [
    { x: 0.0, y: 0.0, z: 0.0 },
    { x: 0.0, y: 0.33, z: -0.065 },
    { x: -0.225, y: -0.17, z: -0.135 },
    { x: 0.225, y: -0.17, z: -0.135 },
    { x: -0.15, y: 0.15, z: -0.125 },
    { x: 0.15, y: 0.15, z: -0.125 },
  ];

  // 1. Identical points must yield residual ~ 0.0
  const identicalResidual = FaceGeometryEstimator.kabschResidual(baseline, baseline);
  assert.ok(identicalResidual < 1e-4, `Identical shapes must have residual ~ 0, got ${identicalResidual}`);

  // 2. Rigidly translated and rotated points must still yield residual ~ 0.0 (invariance)
  const angle = 0.25; // ~14 degrees rotation around Z
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  const tx = 0.15;
  const ty = -0.08;

  const transformed: Point3D[] = baseline.map((p) => ({
    x: p.x * cosA - p.y * sinA + tx,
    y: p.x * sinA + p.y * cosA + ty,
    z: p.z,
  }));

  const transformedResidual = FaceGeometryEstimator.kabschResidual(transformed, baseline);
  assert.ok(
    transformedResidual < 0.015,
    `Rigidly rotated/translated shape must have near-zero residual, got ${transformedResidual}`
  );

  // 3. Deformed / different face geometry must yield significant residual (> 0.05)
  const distorted: Point3D[] = baseline.map((p, idx) => ({
    x: p.x * (idx % 2 === 0 ? 1.6 : 0.6),
    y: p.y * (idx % 3 === 0 ? 0.5 : 1.4),
    z: p.z + 0.1,
  }));

  const distortedResidual = FaceGeometryEstimator.kabschResidual(distorted, baseline);
  assert.ok(
    distortedResidual > 0.05,
    `Distorted/different face geometry must produce significant residual (>0.05), got ${distortedResidual}`
  );
});
