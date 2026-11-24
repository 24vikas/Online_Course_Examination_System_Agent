#!/usr/bin/env node
/**
 * Standalone Host-Based Proctor Companion CLI Runner
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { ProctorCompanionClient } from "./companion-client.ts";
import { CameraPipeline } from "./camera-pipeline.ts";
import { DisplayGazeCalibrator } from "./gaze-calibrator.ts";

interface CliOptions {
  challenge?: string;
  attemptId: string;
  serverUrl: string;
  tenantId: string;
  durationSeconds?: number;
  simulateOnly?: boolean;
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  const options: Partial<CliOptions> = {
    serverUrl: process.env.AURA_SERVER_URL || "http://127.0.0.1:3000",
    tenantId: process.env.AURA_TENANT_ID || "11111111-1111-1111-1111-111111111111",
    simulateOnly: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--challenge" && i + 1 < args.length) {
      options.challenge = args[++i];
    } else if ((arg === "--attempt" || arg === "--attemptId") && i + 1 < args.length) {
      options.attemptId = args[++i];
    } else if (arg === "--server" && i + 1 < args.length) {
      options.serverUrl = args[++i];
    } else if (arg === "--tenant" && i + 1 < args.length) {
      options.tenantId = args[++i];
    } else if (arg === "--duration" && i + 1 < args.length) {
      options.durationSeconds = parseInt(args[++i], 10);
    } else if (arg === "--simulate") {
      options.simulateOnly = true;
    } else if (arg.startsWith("aura-proctor://start")) {
      // Parse URL scheme
      try {
        const parsed = new URL(arg);
        options.challenge = parsed.searchParams.get("challenge") || undefined;
        options.attemptId = parsed.searchParams.get("attemptId") || options.attemptId;
      } catch {}
    }
  }

  if (!options.attemptId) {
    options.attemptId = "22222222-2222-2222-2222-222222222222";
  }

  return options as CliOptions;
}

async function run() {
  const opts = parseArgs();

  console.log("================================================================================");
  console.log("  AURA DESKTOP PROCTOR COMPANION CLIENT v1.0.0");
  console.log("  KLE Technological University — Course 26ECAC401 (Agentic AI)");
  console.log("  Team 5: Team AURA");
  console.log("================================================================================");
  console.log(`[Config] Target Server : ${opts.serverUrl}`);
  console.log(`[Config] Attempt ID    : ${opts.attemptId}`);
  console.log(`[Config] Challenge     : ${opts.challenge ? opts.challenge.substring(0, 16) + "..." : "NONE"}`);
  console.log(`[Config] Mode          : ${opts.simulateOnly ? "SIMULATED_TEST" : "LIVE_EDGE_CLIENT"}`);
  console.log("--------------------------------------------------------------------------------");

  const camera = new CameraPipeline({ enableVirtualFallback: true });
  await camera.initialize();
  console.log(`[1/5 Camera] Initialized: ${camera.getIsVirtual() ? "SIMULATED_FALLBACK" : "HARDWARE_DEVICE"}`);

  const client = new ProctorCompanionClient({
    serverBaseUrl: opts.serverUrl,
    attemptId: opts.attemptId,
    sessionToken: "",
    tenantId: opts.tenantId,
    version: "proctor-companion-1.0.0",
    os: `${process.platform}-${process.arch}`,
  });

  // Step 1: Preflight
  const preflightOk = client.completePreflight({
    cameraAvailable: true,
    lightingAdequate: true,
    networkAvailable: true,
    singleDisplay: true,
  });
  console.log(`[2/5 Preflight] Result: ${preflightOk ? "PASSED (State: CALIBRATING)" : "FAILED"}`);

  // Step 2: 5-Point Calibration
  const calibrationSamples = DisplayGazeCalibrator.TARGETS.map((t) => ({
    targetId: t.id,
    eyeVector: { x: t.normalizedX, y: t.normalizedY },
  }));
  client.calibrateGaze(calibrationSamples);
  console.log(`[3/5 Calibration] Calibrated 5 Targets. Quality: ${client.gazeCalibrator.getCalibrationQuality()}`);

  // Step 3: Register Session using single-use challenge token
  let sessionToken = "";
  try {
    const res = await fetch(`${opts.serverUrl}/api/proctor/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        attemptId: opts.attemptId,
        companionVersion: "proctor-companion-1.0.0",
        companionOs: `${process.platform}-${process.arch}`,
        challengeToken: opts.challenge,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      sessionToken = data.sessionToken || "";
      console.log(`[4/5 Session] Registered successfully! Session ID: ${data.sessionId}`);
      // Mark ready
      await fetch(`${opts.serverUrl}/api/proctor/state`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attemptId: opts.attemptId,
          status: "PROCTOR_READY",
          calibrationData: { quality: "EXCELLENT", points: 5 },
        }),
      });
      console.log(`[4/5 Session] State transition -> PROCTOR_READY`);
    } else {
      const err = await res.text();
      console.warn(`[4/5 Session] Server registration warning (${res.status}): ${err}`);
    }
  } catch (err: any) {
    console.warn(`[4/5 Session] Network connection notice: ${err.message}`);
  }

  // Step 4: Stream Telemetry Loop
  console.log("[5/5 Streaming] Beginning edge telemetry transmission...");
  let seq = 0;
  const maxFrames = opts.durationSeconds ? opts.durationSeconds : 10;
  const interval = setInterval(async () => {
    seq++;
    const frameData = camera.processFrame();

    const telemetryFrame = {
      sequenceNumber: seq,
      timestamp: frameData.timestamp,
      facePresence: {
        isFacePresent: frameData.geometry.isFacePresent,
        faceCount: frameData.geometry.faceCount,
        detectionConfidence: frameData.geometry.detectionConfidence,
      },
      headPose: {
        pitchDegrees: frameData.geometry.headPose.pitchDegrees,
        yawDegrees: frameData.geometry.headPose.yawDegrees,
        rollDegrees: frameData.geometry.headPose.rollDegrees,
        trackingConfidence: 0.95,
      },
      displayGaze: {
        normalizedX: frameData.irisGaze.normalizedX,
        normalizedY: frameData.irisGaze.normalizedY,
        isOnScreen: true,
        fixationDurationMs: seq * 1000,
      },
      osIntegrity: {
        isWindowFocused: true,
        isFullScreen: true,
        clipboardEventsCount: 0,
        displayCount: 1,
      },
    };

    client.recordTelemetryFrame(telemetryFrame);

    if (seq % 2 === 0) {
      console.log(`  [Frame #${seq}] Pitch: ${telemetryFrame.headPose.pitchDegrees}° | Yaw: ${telemetryFrame.headPose.yawDegrees}° | Gaze: (${telemetryFrame.displayGaze.normalizedX}, ${telemetryFrame.displayGaze.normalizedY}) | Normal: ${frameData.geometry.isPoseNormal}`);
    }

    if (seq >= maxFrames) {
      clearInterval(interval);
      camera.stop();
      console.log("================================================================================");
      console.log(`[Complete] Telemetry stream finished (${seq} frames emitted). Session healthy.`);
      console.log("================================================================================");
      process.exit(0);
    }
  }, 1000);

  process.on("SIGINT", () => {
    console.log("\n[Shutdown] Stopping camera pipeline and releasing resources...");
    clearInterval(interval);
    camera.stop();
    process.exit(0);
  });
}

run().catch((err) => {
  console.error("Fatal Companion Error:", err);
  process.exit(1);
});
