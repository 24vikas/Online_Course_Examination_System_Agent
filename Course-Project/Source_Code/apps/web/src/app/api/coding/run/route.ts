import { NextRequest, NextResponse } from "next/server";
import { requireProctoredCodingAttempt } from "@/lib/coding/policy";
import { executeIsolatedCode, type CodingLanguage } from "@/lib/coding/bwrapJudge";
import { queryDb } from "@/lib/db";
import { AuraProctorAuthorizationError } from "@/lib/proctoring/proctorAuthorization";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { attemptId, questionId, code, language, customInput } = body;

    if (!attemptId || !questionId || typeof code !== "string" || !language) {
      return NextResponse.json(
        { error: "Missing required fields: attemptId, questionId, code, language" },
        { status: 400 }
      );
    }

    // 1. Authorize via strict proctor guard (checks companion heartbeat, session, status)
    let authZ;
    try {
      authZ = await requireProctoredCodingAttempt(request, attemptId, "run");
    } catch (err: any) {
      if (err instanceof AuraProctorAuthorizationError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.statusCode });
      }
      return NextResponse.json({ error: err?.message || "Proctor authorization failed" }, { status: 403 });
    }

    // 2. Fetch public problem details
    const revRes = await queryDb(
      `SELECT public_problem FROM coding_problem_revisions
       WHERE question_id = $1 AND tenant_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [questionId, authZ.tenantId]
    );

    let publicProblem = revRes.rows[0]?.public_problem;

    if (!publicProblem) {
      // Check exam_paper_snapshots
      const snapRes = await queryDb(
        `SELECT questions FROM exam_paper_snapshots WHERE schedule_id = $1 AND tenant_id = $2 LIMIT 1`,
        [authZ.scheduleId, authZ.tenantId]
      );
      if (snapRes.rowCount && snapRes.rows[0]?.questions) {
        const questions = typeof snapRes.rows[0].questions === "string"
          ? JSON.parse(snapRes.rows[0].questions)
          : snapRes.rows[0].questions;
        const matched = questions.find((q: any) => q.id === questionId);
        if (matched?.public_problem) {
          publicProblem = matched.public_problem;
        }
      }
    }

    const timeLimitMs = publicProblem?.timeLimitMs || 2000;
    const memoryLimitKiB = publicProblem?.memoryLimitKiB || 65536;
    const lang = (language as string).toLowerCase() as CodingLanguage;

    // 3. Execution: custom input vs public examples
    if (customInput !== undefined && customInput !== null) {
      const res = await executeIsolatedCode(lang, code, String(customInput), {
        timeLimitMs,
        memoryLimitKiB,
      });

      return NextResponse.json({
        results: [
          {
            input: String(customInput),
            actualOutput: res.stdout,
            stderr: res.stderr,
            durationMs: res.durationMs,
            outcome: res.outcome,
            exitCode: res.exitCode,
          },
        ],
        allPassed: res.outcome === "accepted",
      });
    }

    // Public problem examples execution
    const examples: { input: string; output: string }[] = publicProblem?.examples || [];
    if (examples.length === 0) {
      // Default fallback single run without input
      const res = await executeIsolatedCode(lang, code, "", { timeLimitMs, memoryLimitKiB });
      return NextResponse.json({
        results: [
          {
            input: "",
            actualOutput: res.stdout,
            stderr: res.stderr,
            durationMs: res.durationMs,
            outcome: res.outcome,
            exitCode: res.exitCode,
          },
        ],
        allPassed: res.outcome === "accepted",
      });
    }

    const results = [];
    for (const ex of examples) {
      const res = await executeIsolatedCode(lang, code, ex.input, {
        expectedOutput: ex.output,
        timeLimitMs,
        memoryLimitKiB,
      });

      results.push({
        input: ex.input,
        expectedOutput: ex.output,
        actualOutput: res.stdout,
        stderr: res.stderr,
        durationMs: res.durationMs,
        outcome: res.outcome,
        exitCode: res.exitCode,
      });
    }

    const allPassed = results.every((r) => r.outcome === "accepted");

    return NextResponse.json({ results, allPassed });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Internal server error" }, { status: 500 });
  }
}
