import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { calculateCodingMarks, requireProctoredCodingAttempt, type JudgeOutcome } from "@/lib/coding/policy";
import { executeIsolatedCode, type CodingLanguage } from "@/lib/coding/bwrapJudge";
import { queryDb } from "@/lib/db";
import { AuraProctorAuthorizationError } from "@/lib/proctoring/proctorAuthorization";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { attemptId, questionId, code, language } = body;

    if (!attemptId || !questionId || typeof code !== "string" || !language) {
      return NextResponse.json(
        { error: "Missing required fields: attemptId, questionId, code, language" },
        { status: 400 }
      );
    }

    // 1. Authorize via strict proctor guard (checks companion heartbeat, session, status)
    let authZ;
    try {
      authZ = await requireProctoredCodingAttempt(request, attemptId, "submit");
    } catch (err: any) {
      if (err instanceof AuraProctorAuthorizationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
      }
      return NextResponse.json({ error: err?.message || "Proctor authorization failed" }, { status: 403 });
    }

    // 2. Fetch hidden tests and problem metadata
    let hiddenTests: { input: string; output: string; weight: number }[] = [];
    let publicProblem: any = null;
    let questionMarks = 10;

    // First check exam_paper_answer_keys for snapshot test sets
    const keyRes = await queryDb(
      `SELECT answer_keys FROM exam_paper_answer_keys WHERE schedule_id = $1 LIMIT 1`,
      [authZ.scheduleId]
    );

    if (keyRes.rowCount && keyRes.rows[0]?.answer_keys) {
      const keys = typeof keyRes.rows[0].answer_keys === "string"
        ? JSON.parse(keyRes.rows[0].answer_keys)
        : keyRes.rows[0].answer_keys;
      const qKey = keys[questionId];
      if (qKey && Array.isArray(qKey.hiddenTests)) {
        hiddenTests = qKey.hiddenTests;
      }
    }

    // Also fetch question marks and public problem from database
    const qRes = await queryDb(
      `SELECT q.marks, p.public_problem, h.hidden_tests
       FROM question_bank q
       LEFT JOIN coding_problem_revisions p ON p.question_id = q.id AND p.tenant_id = q.tenant_id
       LEFT JOIN coding_hidden_test_sets h ON h.question_id = q.id AND h.revision_id = p.revision_id AND h.tenant_id = q.tenant_id
       WHERE q.id = $1 AND q.tenant_id = $2
       ORDER BY p.created_at DESC LIMIT 1`,
      [questionId, authZ.tenantId]
    );

    if (qRes.rowCount) {
      questionMarks = Number(qRes.rows[0].marks) || 10;
      publicProblem = qRes.rows[0].public_problem;
      if (hiddenTests.length === 0 && Array.isArray(qRes.rows[0].hidden_tests)) {
        hiddenTests = qRes.rows[0].hidden_tests;
      }
    }

    if (hiddenTests.length === 0) {
      // Fallback to public examples if no separate hidden tests are authored
      const examples: { input: string; output: string }[] = publicProblem?.examples || [];
      hiddenTests = examples.map((ex) => ({ ...ex, weight: 1 }));
    }

    const timeLimitMs = publicProblem?.timeLimitMs || 2000;
    const memoryLimitKiB = publicProblem?.memoryLimitKiB || 65536;
    const lang = (language as string).toLowerCase() as CodingLanguage;

    // 3. Execute all hidden tests in isolated bwrap runner
    const outcomes: { weight: number; outcome: JudgeOutcome }[] = [];
    for (const tc of hiddenTests) {
      const weight = Math.max(1, Math.min(Number(tc.weight) || 1, 1000));
      const res = await executeIsolatedCode(lang, code, tc.input, {
        expectedOutput: tc.output,
        timeLimitMs,
        memoryLimitKiB,
        weight,
      });
      outcomes.push({ weight, outcome: res.outcome });
    }

    // 4. Calculate marks using strict non-LLM algorithm
    const maxMarksHundredths = Math.round(Number(questionMarks) * 100);
    const scoringRule = publicProblem?.scoring === "all_or_nothing" ? "all_or_nothing" : "weighted";
    const marksHundredths = calculateCodingMarks(maxMarksHundredths, scoringRule, outcomes);
    const marksAwarded = marksHundredths !== null ? marksHundredths / 100 : 0;
    const passedCount = outcomes.filter((o) => o.outcome === "accepted").length;

    // 5. Store response in attempt_responses
    const responsePayload = {
      code,
      language: lang,
      marksAwarded,
      maxMarks: questionMarks,
      totalTests: outcomes.length,
      passedTests: passedCount,
      outcomes: outcomes.map((o) => ({ outcome: o.outcome, weight: o.weight })),
      isEvaluated: true,
      submittedAt: new Date().toISOString(),
    };

    await queryDb(
      `INSERT INTO attempt_responses (
        id, tenant_id, attempt_id, question_id, answer_json, sequence_number, saved_at
      ) VALUES (
        $1, $2, $3, $4, $5, 1, NOW()
      )
      ON CONFLICT (attempt_id, question_id)
      DO UPDATE SET
        answer_json = EXCLUDED.answer_json,
        saved_at = NOW()`,
      [
        crypto.randomUUID(),
        authZ.tenantId,
        authZ.attemptId,
        questionId,
        JSON.stringify(responsePayload),
      ]
    );

    return NextResponse.json({
      success: true,
      marksAwarded,
      maxMarks: questionMarks,
      totalTests: outcomes.length,
      passedTests: passedCount,
      outcomes: outcomes.map((o) => ({ outcome: o.outcome, weight: o.weight })),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
