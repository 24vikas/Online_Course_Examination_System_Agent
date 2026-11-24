/**
 * Incident Detector with Sustained Dwell Times & Hysteresis Unit Tests
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { IncidentDetector } from "../src/incident-detector.ts";

test("Incident Detector: Enforces sustained dwell times and filters transient glitches", () => {
  const detector = new IncidentDetector({
    lookAwayDwellSeconds: 5.0,
    multipleFacesDwellSeconds: 2.5,
    faceAbsentDwellSeconds: 5.0,
    exitDwellSeconds: 2.0,
  });

  // Step 1: Brief look away for 2.0s (transient glitch) -> should NOT trigger incident
  let res = detector.step(10.0, { lookAway: true });
  assert.equal(res.newEvents.length, 0);

  res = detector.step(12.0, { lookAway: true });
  assert.equal(res.newEvents.length, 0, "Look away active for 2s must not trigger incident (dwell is 5s)");

  // Step 2: Glitch ends at 12.5s -> condition returns to false
  res = detector.step(12.5, { lookAway: false });
  assert.equal(res.newEvents.length, 0);

  // Step 3: Sustained look away starting at 20.0s
  res = detector.step(20.0, { lookAway: true });
  assert.equal(res.newEvents.length, 0);

  // At 24.0s (elapsed 4.0s < 5.0s) -> no incident yet
  res = detector.step(24.0, { lookAway: true });
  assert.equal(res.newEvents.length, 0, "Look away at 4.0s must not trigger incident yet");

  // At 25.1s (elapsed 5.1s >= 5.0s) -> INCIDENT TRIGGERED
  res = detector.step(25.1, { lookAway: true });
  assert.equal(res.newEvents.length, 1, "Look away sustained >= 5.0s must emit new incident");
  assert.equal(res.newEvents[0].type, "LOOK_AWAY");
  assert.equal(res.activeIncidents.length, 1);
});

test("Incident Detector: Multiple faces sustained dwell time (2.5s)", () => {
  const detector = new IncidentDetector({
    multipleFacesDwellSeconds: 2.5,
    exitDwellSeconds: 2.0,
  });

  // Multiple faces starting at 10.0s
  detector.step(10.0, { multipleFaces: true });
  let res = detector.step(11.5, { multipleFaces: true }); // elapsed 1.5s
  assert.equal(res.newEvents.length, 0);

  // At 12.6s (elapsed 2.6s >= 2.5s) -> incident triggered
  res = detector.step(12.6, { multipleFaces: true });
  assert.equal(res.newEvents.length, 1);
  assert.equal(res.newEvents[0].type, "MULTIPLE_FACES");
  assert.equal(res.newEvents[0].severity, "HIGH");
});

test("Incident Detector: Hysteresis prevents premature incident termination on momentary compliance", () => {
  const detector = new IncidentDetector({
    faceAbsentDwellSeconds: 5.0,
    exitDwellSeconds: 2.0,
  });

  // Start face absent at 0.0s
  detector.step(0.0, { faceAbsent: true });
  detector.step(2.5, { faceAbsent: true });
  let res = detector.step(5.1, { faceAbsent: true });
  assert.equal(res.newEvents.length, 1, "Face absent incident must be emitted at 5.1s");
  assert.equal(detector.getActiveEvents().length, 1);

  // Candidate briefly pops back into frame for 1.0s (less than exitDwell 2.0s)
  res = detector.step(6.0, { faceAbsent: false });
  assert.equal(res.closedEvents.length, 0, "1.0s compliance must NOT close incident (exit dwell is 2.0s)");
  assert.equal(detector.getActiveEvents().length, 1, "Incident must remain active during transient return");

  // Candidate leaves again at 6.5s
  res = detector.step(6.5, { faceAbsent: true });
  assert.equal(detector.getActiveEvents().length, 1);

  // Candidate returns and remains compliant for >= 2.0s (from 10.0s to 12.1s)
  detector.step(10.0, { faceAbsent: false });
  detector.step(11.0, { faceAbsent: false });
  res = detector.step(12.1, { faceAbsent: false });
  assert.equal(res.closedEvents.length, 1, "Incident must cleanly close after 2.1s of sustained compliance");
  assert.equal(detector.getActiveEvents().length, 0, "No active incidents should remain");
  assert.equal(res.closedEvents[0].type, "FACE_ABSENT");
  assert.ok(res.closedEvents[0].endTime !== undefined);
});
