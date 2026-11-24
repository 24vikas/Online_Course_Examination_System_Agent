/**
 * Phase 16 Challenge-Response Protocol & Replay Attack Defense Tests
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { ProctorCompanionService } from "../src/index.ts";

class MockChallengeDb {
  public challenges: any[] = [];
  public sessions: any[] = [];
  public queries: any[] = [];

  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    this.queries.push({ sql, params });

    // INSERT INTO exam_proctoring_challenges
    if (sql.includes("INSERT INTO exam_proctoring_challenges")) {
      const id = `challenge-${this.challenges.length + 1}`;
      const expiresAt = new Date(Date.now() + parseInt(params[5], 10) * 1000);
      const row = {
        id,
        tenant_id: params[0],
        attempt_id: params[1],
        student_id: params[2],
        challenge_token: params[3],
        challenge_token_hash: params[4],
        expires_at: expiresAt,
        consumed_at: null,
      };
      this.challenges.push(row);
      return { rows: [row] };
    }

    // SELECT FROM exam_proctoring_challenges
    if (sql.includes("SELECT id, student_id, expires_at, consumed_at") && sql.includes("FROM exam_proctoring_challenges")) {
      const [tenantId, attemptId, hash] = params;
      const found = this.challenges.find(
        (c) => c.tenant_id === tenantId && c.attempt_id === attemptId && c.challenge_token_hash === hash
      );
      return { rows: found ? [found] : [] };
    }

    // UPDATE exam_proctoring_challenges SET consumed_at
    if (sql.includes("UPDATE exam_proctoring_challenges") && sql.includes("consumed_at = CURRENT_TIMESTAMP")) {
      const id = params[0];
      const target = this.challenges.find((c) => c.id === id);
      if (target) {
        target.consumed_at = new Date();
      }
      return { rows: target ? [target] : [] };
    }

    // INSERT INTO exam_proctoring_sessions
    if (sql.includes("INSERT INTO exam_proctoring_sessions")) {
      const row = {
        id: `session-${this.sessions.length + 1}`,
        tenant_id: params[0],
        attempt_id: params[1],
        student_id: params[2],
        companion_version: params[3],
        companion_os: params[4],
        session_token_hash: params[5],
        status: "PREFLIGHT",
      };
      this.sessions.push(row);
      return { rows: [row] };
    }

    return { rows: [] };
  }
}

test("Phase 16: Challenge generation produces valid token, TTL, and launch URI", async () => {
  const db = new MockChallengeDb();
  const service = new ProctorCompanionService(db);

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const attemptId = "22222222-2222-2222-2222-222222222222";
  const studentId = "33333333-3333-3333-3333-333333333333";

  const challenge = await service.generateChallenge(tenantId, attemptId, studentId, 300);

  assert.ok(challenge.challengeToken.startsWith("aura_challenge_"), "Token should have aura_challenge_ prefix");
  assert.equal(challenge.ttlSeconds, 300, "TTL must be 300 seconds");
  assert.equal(challenge.attemptId, attemptId, "Attempt ID must match");
  assert.ok(challenge.launchUri.startsWith("aura-proctor://start?"), "Launch URI must use aura-proctor:// protocol scheme");
  assert.ok(challenge.launchUri.includes(encodeURIComponent(challenge.challengeToken)), "Launch URI must contain encoded challenge");
  assert.equal(db.challenges.length, 1, "Challenge record must be inserted in database");
});

test("Phase 16: Challenge consumption succeeds once and enforces replay attack defense", async () => {
  const db = new MockChallengeDb();
  const service = new ProctorCompanionService(db);

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const attemptId = "22222222-2222-2222-2222-222222222222";
  const studentId = "33333333-3333-3333-3333-333333333333";

  const challenge = await service.generateChallenge(tenantId, attemptId, studentId, 300);

  // First consumption: Must succeed
  const result = await service.consumeChallenge(tenantId, attemptId, challenge.challengeToken);
  assert.equal(result.valid, true, "First consumption must be valid");
  assert.equal(result.studentId, studentId, "Student ID must match");
  assert.ok(db.challenges[0].consumed_at !== null, "consumed_at must be recorded");

  // Second consumption (replay attack): Must throw CHALLENGE_ALREADY_USED
  await assert.rejects(
    async () => {
      await service.consumeChallenge(tenantId, attemptId, challenge.challengeToken);
    },
    { message: /CHALLENGE_ALREADY_USED/ }
  );
});

test("Phase 16: Expired challenge token is rejected", async () => {
  const db = new MockChallengeDb();
  const service = new ProctorCompanionService(db);

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const attemptId = "22222222-2222-2222-2222-222222222222";
  const studentId = "33333333-3333-3333-3333-333333333333";

  // Create challenge with -1 second TTL (already expired)
  const challenge = await service.generateChallenge(tenantId, attemptId, studentId, -1);
  db.challenges[0].expires_at = new Date(Date.now() - 10000); // 10s in the past

  await assert.rejects(
    async () => {
      await service.consumeChallenge(tenantId, attemptId, challenge.challengeToken);
    },
    { message: /CHALLENGE_EXPIRED/ }
  );
});

test("Phase 16: Session registration atomically consumes challenge and prevents replay", async () => {
  const db = new MockChallengeDb();
  const service = new ProctorCompanionService(db);

  const tenantId = "11111111-1111-1111-1111-111111111111";
  const attemptId = "22222222-2222-2222-2222-222222222222";
  const studentId = "33333333-3333-3333-3333-333333333333";

  const challenge = await service.generateChallenge(tenantId, attemptId, studentId, 300);

  // Register session with valid challenge token
  const session = await service.registerSession(
    tenantId,
    attemptId,
    studentId,
    "proctor-companion-1.0.0",
    "linux-x64",
    challenge.challengeToken
  );

  assert.equal(session.status, "PREFLIGHT", "Session must be initialized in PREFLIGHT state");
  assert.ok(session.sessionId, "Session ID must be returned");

  // Replay attempt with same challenge token must fail
  await assert.rejects(
    async () => {
      await service.registerSession(
        tenantId,
        attemptId,
        studentId,
        "proctor-companion-1.0.0",
        "linux-x64",
        challenge.challengeToken
      );
    },
    { message: /CHALLENGE_ALREADY_USED/ }
  );
});
