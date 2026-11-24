/**
 * Audio VAD & RMS VU Meter & Multi-Speaker Advisory Unit Tests
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { AudioVadDetector } from "../src/audio-vad.ts";

test("Audio VAD: Silent audio buffer produces low RMS and speechDetected = false", () => {
  const detector = new AudioVadDetector({ sampleRate: 16000 });
  const sampleCount = 480; // 30ms @ 16kHz
  const silentBuffer = new Float32Array(sampleCount).fill(0.0);

  const metrics = detector.evaluateBuffer(silentBuffer);
  assert.equal(metrics.speechDetected, false, "Silence must not be detected as speech");
  assert.equal(metrics.multiSpeakerSuspected, false);
  assert.ok(metrics.rmsLevel < 0.005, `RMS level must be very low, got ${metrics.rmsLevel}`);
  assert.ok(metrics.decibels <= -60, `Decibels must be <= -60 dBFS, got ${metrics.decibels}`);
});

test("Audio VAD: Stationary background noise (fan/AC) adapts noise floor and does not trigger speech", () => {
  const detector = new AudioVadDetector({ sampleRate: 16000 });
  const sampleCount = 480;

  // Simulate stationary low-frequency room hum (e.g. 60Hz fan/AC hum)
  const fanHumBuffer = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    // 60Hz hum + low-amplitude noise
    fanHumBuffer[i] = 0.02 * Math.sin((2 * Math.PI * 60 * i) / 16000) + (Math.random() - 0.5) * 0.004;
  }

  // Evaluate several sequential frames to allow noise floor to adapt
  let lastMetrics = detector.evaluateBuffer(fanHumBuffer);
  for (let f = 0; f < 15; f++) {
    lastMetrics = detector.evaluateBuffer(fanHumBuffer);
  }

  // Stationary hum is outside human speech formant band (300-3400 Hz)
  assert.equal(
    lastMetrics.speechDetected,
    false,
    "Stationary low-frequency fan hum must not trigger speech detection"
  );
  assert.ok(lastMetrics.noiseFloor > 0.005, "Noise floor must adapt upwards for background hum");
});

test("Audio VAD: Speech audio buffer with formant frequencies triggers speechDetected = true", () => {
  const detector = new AudioVadDetector({ sampleRate: 16000 });
  const sampleCount = 960; // 60ms @ 16kHz

  // First feed ambient quiet frame to establish low noise floor
  const quietBuffer = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) quietBuffer[i] = (Math.random() - 0.5) * 0.002;
  detector.evaluateBuffer(quietBuffer);

  // Synthesize speech-like vowel waveform with vocal formants F1=700Hz and F2=1200Hz
  const speechBuffer = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / 16000;
    const formant1 = 0.15 * Math.sin(2 * Math.PI * 700 * t);
    const formant2 = 0.08 * Math.sin(2 * Math.PI * 1200 * t);
    const pitchHarmonic = 0.05 * Math.sin(2 * Math.PI * 160 * t);
    speechBuffer[i] = formant1 + formant2 + pitchHarmonic;
  }

  const metrics = detector.evaluateBuffer(speechBuffer);
  assert.equal(metrics.speechDetected, true, "Synthesized vocal formant buffer must trigger speechDetected");
  assert.ok(metrics.speechConfidence >= 0.50, `Speech confidence must be >= 0.50, got ${metrics.speechConfidence}`);
  assert.ok(metrics.rmsLevel > 0.04, `Speech RMS level must be significant, got ${metrics.rmsLevel}`);
});

test("Audio VAD: Dual distinct pitches trigger multiSpeakerSuspected advisory notice", () => {
  const detector = new AudioVadDetector({ sampleRate: 16000 });
  const sampleCount = 960;

  // Establish quiet noise floor
  const quiet = new Float32Array(sampleCount).fill(0.001);
  detector.evaluateBuffer(quiet);

  // Synthesize two simultaneous speakers with distinct fundamental pitch frequencies:
  // Speaker 1: ~130 Hz (male pitch)
  // Speaker 2: ~240 Hz (female pitch)
  // Plus formant harmonics
  const dualSpeakerBuffer = new Float32Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const t = i / 16000;
    // Speaker 1
    const s1 = 0.12 * Math.sin(2 * Math.PI * 130 * t) + 0.06 * Math.sin(2 * Math.PI * 750 * t);
    // Speaker 2
    const s2 = 0.10 * Math.sin(2 * Math.PI * 240 * t) + 0.05 * Math.sin(2 * Math.PI * 1300 * t);
    dualSpeakerBuffer[i] = s1 + s2;
  }

  const metrics = detector.evaluateBuffer(dualSpeakerBuffer);
  assert.equal(metrics.speechDetected, true);
  assert.equal(
    metrics.multiSpeakerSuspected,
    true,
    "Bimodal pitch patterns from simultaneous speakers must trigger multiSpeakerSuspected advisory"
  );
});
