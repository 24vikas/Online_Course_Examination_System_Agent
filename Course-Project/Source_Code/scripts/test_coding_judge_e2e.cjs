/**
 * scripts/test_coding_judge_e2e.cjs
 *
 * Verification suite for Bubblewrap isolated execution judge and scoring engine.
 */

const assert = require("node:assert/strict");
const path = require("node:path");

async function main() {
  console.log("================================================================================");
  console.log(" AURA PHASE 25 — BUBBLEWRAP ISOLATED JUDGE & CODING ENGINE VERIFICATION");
  console.log("================================================================================");

  // Dynamically import ESM bwrapJudge and policy
  const { executeIsolatedCode, compareOutputs, normalizeOutput } = await import(
    "../apps/web/src/lib/coding/bwrapJudge.ts"
  );
  const { calculateCodingMarks } = await import("../apps/web/src/lib/coding/policy.ts");

  console.log("\n--- TEST 1: Bubblewrap Output Normalization & Comparison ---");
  assert.equal(normalizeOutput("  Hello World  \r\n42 \n"), "Hello World\n42");
  assert.equal(compareOutputs("60\r\n", "60\n"), true);
  assert.equal(compareOutputs("60", "61"), false);
  console.log("[✓ PASS] T1: Output comparison correctly normalizes CRLF and trailing spaces.");

  console.log("\n--- TEST 2: Python Code Execution (Accepted) ---");
  const pyCode = `
import sys
line = sys.stdin.read().strip()
nums = [int(x) for x in line.split()]
print(sum(nums))
`;
  const res1 = await executeIsolatedCode("python", pyCode, "15 25 35\n", {
    expectedOutput: "75",
    timeLimitMs: 2000,
  });
  console.log("Result:", { outcome: res1.outcome, stdout: res1.stdout.trim(), durationMs: res1.durationMs });
  assert.equal(res1.outcome, "accepted");
  assert.equal(res1.stdout.trim(), "75");
  assert.ok(res1.durationMs < 500, `Execution took ${res1.durationMs}ms, expected < 500ms`);
  console.log(`[✓ PASS] T2: Python sum program accepted in ${res1.durationMs}ms.`);

  console.log("\n--- TEST 3: Python Wrong Answer Detection ---");
  const res2 = await executeIsolatedCode("python", "print(999)", "15 25 35\n", {
    expectedOutput: "75",
    timeLimitMs: 2000,
  });
  console.log("Result:", { outcome: res2.outcome, stdout: res2.stdout.trim() });
  assert.equal(res2.outcome, "wrong_answer");
  console.log("[✓ PASS] T3: Discrepant output classified as 'wrong_answer'.");

  console.log("\n--- TEST 4: Execution Timeout Enforcement ---");
  const infiniteLoop = "import time\nwhile True:\n    time.sleep(0.1)\n";
  const res3 = await executeIsolatedCode("python", infiniteLoop, "", {
    timeLimitMs: 400,
  });
  console.log("Result:", { outcome: res3.outcome, durationMs: res3.durationMs });
  assert.equal(res3.outcome, "timeout");
  console.log(`[✓ PASS] T4: Infinite loop terminated at ${res3.durationMs}ms as 'timeout'.`);

  console.log("\n--- TEST 5: Runtime Error Capture ---");
  const errorProg = "x = 1 / 0\n";
  const res4 = await executeIsolatedCode("python", errorProg, "", {
    timeLimitMs: 2000,
  });
  console.log("Result:", { outcome: res4.outcome, exitCode: res4.exitCode });
  assert.equal(res4.outcome, "runtime_error");
  assert.ok(res4.stderr.includes("ZeroDivisionError"));
  console.log("[✓ PASS] T5: ZeroDivisionError correctly captured as 'runtime_error'.");

  console.log("\n--- TEST 6: Strict Network Isolation ---");
  const netProg = `
import socket
s = socket.socket()
s.connect(("8.8.8.8", 53))
`;
  const res5 = await executeIsolatedCode("python", netProg, "", {
    timeLimitMs: 2000,
  });
  console.log("Result:", { outcome: res5.outcome, exitCode: res5.exitCode });
  assert.equal(res5.outcome, "runtime_error");
  assert.ok(res5.stderr.includes("Network is unreachable") || res5.stderr.includes("OSError"));
  console.log("[✓ PASS] T6: Network socket connection strictly blocked by unshared namespace.");

  console.log("\n--- TEST 7: Scoring Algorithm (Weighted vs All-or-Nothing) ---");
  const outcomes = [
    { weight: 1, outcome: "accepted" },
    { weight: 2, outcome: "accepted" },
    { weight: 1, outcome: "wrong_answer" },
  ];
  // 1000 hundredths = 10.00 marks. 3/4 passed -> 7.50 marks (750 hundredths)
  const weightedScore = calculateCodingMarks(1000, "weighted", outcomes);
  assert.equal(weightedScore, 750);

  const aonScore = calculateCodingMarks(1000, "all_or_nothing", outcomes);
  assert.equal(aonScore, 0);

  const perfectScore = calculateCodingMarks(1000, "all_or_nothing", [
    { weight: 1, outcome: "accepted" },
    { weight: 1, outcome: "accepted" },
  ]);
  assert.equal(perfectScore, 1000);
  console.log(`[✓ PASS] T7: Scoring correctly computed: Weighted=7.5/10, All-or-Nothing=0/10, Perfect=10/10.`);

  console.log("\n================================================================================");
  console.log(" ALL 7 CODING JUDGE TESTS PASSED (100%)");
  console.log("================================================================================");
}

main().catch((err) => {
  console.error("FATAL ERROR in test_coding_judge_e2e:", err);
  process.exit(1);
});
