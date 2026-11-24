/**
 * Face Bounding Box & Continuity Verification Tests
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  FaceGeometryEstimator,
  type FaceLandmarkSet,
} from "../src/face-geometry.ts";
import { CameraPipeline } from "../src/camera-pipeline.ts";

test("Face Bounding Box: Calculates visible bounding box with physiological padding", () => {
  const landmarks: FaceLandmarkSet = {
    noseTip: { x: 0.5, y: 0.52, z: 0.0 },
    chin: { x: 0.5, y: 0.8, z: 0.0 },
    leftEyeOuter: { x: 0.36, y: 0.38, z: 0.0 },
    rightEyeOuter: { x: 0.64, y: 0.38, z: 0.0 },
    leftMouthCorner: { x: 0.41, y: 0.68, z: 0.0 },
    rightMouthCorner: { x: 0.59, y: 0.68, z: 0.0 },
  };

  const bb = FaceGeometryEstimator.computeBoundingBox(landmarks);

  assert.ok(bb.x >= 0 && bb.x <= 1, "Bounding box X must be normalized [0, 1]");
  assert.ok(bb.y >= 0 && bb.y <= 1, "Bounding box Y must be normalized [0, 1]");
  assert.ok(bb.width > 0 && bb.width <= 1, "Bounding box width must be positive and <= 1");
  assert.ok(bb.height > 0 && bb.height <= 1, "Bounding box height must be positive and <= 1");

  // Verify bounding box encloses all key facial landmarks
  assert.ok(bb.x <= landmarks.leftEyeOuter.x, "Box must enclose left eye");
  assert.ok(bb.x + bb.width >= landmarks.rightEyeOuter.x, "Box must enclose right eye");
  assert.ok(bb.y <= landmarks.leftEyeOuter.y, "Box must extend above eyes");
  assert.ok(bb.y + bb.height >= landmarks.chin.y, "Box must extend below chin");
});

test("Face Continuity: Compares session start baseline photo against live face stream", () => {
  const baselineLandmarks: FaceLandmarkSet = {
    noseTip: { x: 0.5, y: 0.52, z: 0.0 },
    chin: { x: 0.5, y: 0.8, z: 0.0 },
    leftEyeOuter: { x: 0.36, y: 0.38, z: 0.0 },
    rightEyeOuter: { x: 0.64, y: 0.38, z: 0.0 },
    leftMouthCorner: { x: 0.41, y: 0.68, z: 0.0 },
    rightMouthCorner: { x: 0.59, y: 0.68, z: 0.0 },
  };

  const baselineSig = FaceGeometryEstimator.computeFaceSignature(baselineLandmarks);
  assert.ok(baselineSig.length > 5, "Signature string generated");

  // Live frame matching same individual (slight movement)
  const liveMatchLandmarks: FaceLandmarkSet = {
    noseTip: { x: 0.51, y: 0.53, z: 0.0 },
    chin: { x: 0.51, y: 0.81, z: 0.0 },
    leftEyeOuter: { x: 0.37, y: 0.39, z: 0.0 },
    rightEyeOuter: { x: 0.65, y: 0.39, z: 0.0 },
    leftMouthCorner: { x: 0.42, y: 0.69, z: 0.0 },
    rightMouthCorner: { x: 0.60, y: 0.69, z: 0.0 },
  };

  const matchResult = FaceGeometryEstimator.evaluate(liveMatchLandmarks, 1, baselineSig);
  assert.ok(matchResult.faceContinuity, "faceContinuity must be present");
  assert.equal(matchResult.faceContinuity.isContinuous, true, "Continuity must match same individual");
  assert.ok(matchResult.faceContinuity.confidenceScore > 0.85, "Confidence score must be high");

  // Different individual / spoof with distorted proportions
  const differentPersonLandmarks: FaceLandmarkSet = {
    noseTip: { x: 0.5, y: 0.35, z: 0.0 }, // completely distorted nose position
    chin: { x: 0.5, y: 0.95, z: 0.0 },
    leftEyeOuter: { x: 0.2, y: 0.2, z: 0.0 },
    rightEyeOuter: { x: 0.8, y: 0.2, z: 0.0 },
    leftMouthCorner: { x: 0.48, y: 0.85, z: 0.0 },
    rightMouthCorner: { x: 0.52, y: 0.85, z: 0.0 },
  };

  const mismatchResult = FaceGeometryEstimator.evaluate(differentPersonLandmarks, 1, baselineSig);
  assert.ok(mismatchResult.faceContinuity, "faceContinuity must be present");
  assert.equal(mismatchResult.faceContinuity.isContinuous, false, "Continuity must reject different face geometry");
});

test("Face Counter: Triggers multiple face violation alert when faceCount > 1", () => {
  const singleFace = FaceGeometryEstimator.evaluate(null, 0);
  assert.equal(singleFace.isFacePresent, false);
  assert.equal(singleFace.faceCount, 0);

  const landmarks: FaceLandmarkSet = {
    noseTip: { x: 0.5, y: 0.5, z: 0.0 },
    chin: { x: 0.5, y: 0.8, z: 0.0 },
    leftEyeOuter: { x: 0.35, y: 0.35, z: 0.0 },
    rightEyeOuter: { x: 0.65, y: 0.35, z: 0.0 },
    leftMouthCorner: { x: 0.4, y: 0.65, z: 0.0 },
    rightMouthCorner: { x: 0.6, y: 0.65, z: 0.0 },
  };

  const multiFace = FaceGeometryEstimator.evaluate(landmarks, 2);
  assert.equal(multiFace.isFacePresent, false, "Multiple faces invalidates single candidate presence");
  assert.equal(multiFace.faceCount, 2, "Raw face count preserved");
  assert.ok(multiFace.boundingBox, "Bounding box calculated for primary face");
});
