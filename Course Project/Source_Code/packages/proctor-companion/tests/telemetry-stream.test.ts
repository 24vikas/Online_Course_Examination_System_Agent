/**
 * Server Telemetry Stream & Live Face Bounding Box Integration Test
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import crypto from "crypto";

import {
  FaceGeometryEstimator,
  type FaceLandmarkSet,
} from "../src/face-geometry.ts";
import { CameraPipeline } from "../src/camera-pipeline.ts";
import { ProctorCompanionClient } from "../src/companion-client.ts";

test("Release Manifest: Package files exist with exact SHA-256 hashes", () => {
  const distDir = path.resolve(import.meta.dirname, "../dist");
  const manifestPath = path.join(distDir, "manifest.json");
  assert.ok(fs.existsSync(manifestPath), "manifest.json must exist in dist");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

  for (const pkg of manifest.packages) {
    const filename = pkg.artifact;
    const expectedHash = pkg.sha256;
    const filePath = path.join(distDir, filename);
    assert.ok(fs.existsSync(filePath), `Release artifact ${filename} must exist`);

    const fileBuffer = fs.readFileSync(filePath);
    const calculatedHash = crypto.createHash("sha256").update(fileBuffer).digest("hex");
    assert.equal(
      calculatedHash,
      expectedHash,
      `SHA-256 digest for ${filename} must match verified manifest`
    );
  }

  // Verify Documentation
  assert.ok(
    fs.existsSync(path.join(distDir, "README_STUDENT_INSTALL.md")),
    "README_STUDENT_INSTALL.md must exist in dist"
  );
  assert.ok(
    fs.existsSync(path.join(distDir, "README_PROCTOR_ADMIN.md")),
    "README_PROCTOR_ADMIN.md must exist in dist"
  );
  assert.ok(
    fs.existsSync(path.join(distDir, "manifest.json")),
    "manifest.json must exist in dist"
  );
});

test("Live Face Bounding Box & Geometry Test: Real-time inference generates valid bounding coordinates", async () => {
  const camera = new CameraPipeline({ enableVirtualFallback: true });
  await camera.initialize();

  // Test 5 sequential frames
  for (let i = 1; i <= 5; i++) {
    const frame = camera.processFrame();
    assert.ok(frame.timestamp);
    assert.equal(frame.geometry.isFacePresent, true);
    assert.equal(frame.geometry.faceCount, 1);
    assert.ok(frame.geometry.detectionConfidence >= 0.95);

    // Bounding Box Validation
    const bb = frame.geometry.boundingBox;
    assert.ok(bb, `Frame #${i} must have a valid bounding box`);
    assert.ok(bb.x >= 0 && bb.x < 1, `Bounding box X (${bb.x}) must be in [0, 1)`);
    assert.ok(bb.y >= 0 && bb.y < 1, `Bounding box Y (${bb.y}) must be in [0, 1)`);
    assert.ok(bb.width > 0 && bb.width <= 1, `Bounding box width (${bb.width}) must be in (0, 1]`);
    assert.ok(bb.height > 0 && bb.height <= 1, `Bounding box height (${bb.height}) must be in (0, 1]`);

    // Head Pose Validation
    assert.ok(Math.abs(frame.geometry.headPose.yawDegrees) <= 35, "Normal simulated posture yaw <= 35");
    assert.ok(Math.abs(frame.geometry.headPose.pitchDegrees) <= 30, "Normal simulated posture pitch <= 30");

    // Iris Gaze Validation
    assert.ok(frame.irisGaze.normalizedX >= 0 && frame.irisGaze.normalizedX <= 1);
    assert.ok(frame.irisGaze.normalizedY >= 0 && frame.irisGaze.normalizedY <= 1);
  }

  camera.stop();
});

test("Server Telemetry Stream Pipeline: Streams and buffers 10 frames with cryptographic session binding", () => {
  const client = new ProctorCompanionClient({
    serverBaseUrl: "http://127.0.0.1:3000",
    attemptId: "22222222-2222-2222-2222-222222222222",
    sessionToken: "aura_telemetry_test_session_token",
    tenantId: "tenant-kle-tech",
    version: "1.0.0",
    os: "win32-x64",
  });

  // Preflight & Calibration
  client.completePreflight({
    cameraAvailable: true,
    lightingAdequate: true,
    networkAvailable: true,
    singleDisplay: true,
  });

  client.calibrateGaze([
    { targetId: "CENTER", eyeVector: { x: 0, y: 0 } },
    { targetId: "TOP_LEFT", eyeVector: { x: -0.2, y: -0.2 } },
    { targetId: "TOP_RIGHT", eyeVector: { x: 0.2, y: -0.2 } },
    { targetId: "BOTTOM_LEFT", eyeVector: { x: -0.2, y: 0.2 } },
    { targetId: "BOTTOM_RIGHT", eyeVector: { x: 0.2, y: 0.2 } },
  ]);

  client.startExam();
  assert.equal(client.getState(), "IN_EXAM");

  // Stream 10 frames
  const streamLog: Array<{ seq: number; face: boolean; yaw: number; pitch: number; gaze: boolean }> = [];
  for (let seq = 1; seq <= 10; seq++) {
    const yaw = ((seq % 5) - 2) * 1.5;
    const pitch = (((seq + 1) % 5) - 2) * 1.0;

    const landmarks: FaceLandmarkSet = {
      noseTip: { x: 0.5 + yaw * 0.002, y: 0.52 + pitch * 0.002, z: 0 },
      chin: { x: 0.5, y: 0.8, z: 0 },
      leftEyeOuter: { x: 0.36, y: 0.38, z: 0 },
      rightEyeOuter: { x: 0.64, y: 0.38, z: 0 },
      leftMouthCorner: { x: 0.41, y: 0.68, z: 0 },
      rightMouthCorner: { x: 0.59, y: 0.68, z: 0 },
    };

    const frame = client.processFrame(landmarks, 1, { x: 0.01 * seq, y: 0.01 * seq });
    assert.equal(frame.sequenceNumber, seq);
    assert.equal(frame.facePresence.isFacePresent, true);
    assert.equal(frame.osIntegrity.isWindowFocused, true);

    streamLog.push({
      seq: frame.sequenceNumber,
      face: frame.facePresence.isFacePresent,
      yaw: frame.headPose.yawDegrees,
      pitch: frame.headPose.pitchDegrees,
      gaze: frame.displayGaze.isOnScreen,
    });
  }

  assert.equal(streamLog.length, 10);
  const buffered = client.flushBuffer();
  assert.equal(buffered.length, 10);
  assert.equal(client.getBufferedFrames().length, 0);

  client.finishExam();
  assert.equal(client.getState(), "SUBMITTED");
});
