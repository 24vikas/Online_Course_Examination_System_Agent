import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { DEMO_CONFIG } from "../../../../lib/constants";
import { activeRuns } from "../../../../lib/runs";
import { resolveAuth } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";
import { resumeLangGraphWorkflow } from "../../../../lib/langgraph";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const body = await req.json();

    const runId = body.runId;
    const questionId = body.questionId;
    const reviewerId = authUser?.userId || body.reviewerId || DEMO_CONFIG.users.lecturer.id;
    const reviewerRole = authUser?.role || "LECTURER";
    const comments = body.comments || "Approved by faculty after review.";
    const action = body.action || "APPROVE";

    // Guard: Only LECTURER or COE_ADMIN may approve/review questions
    if (reviewerRole !== "LECTURER" && reviewerRole !== "COE_ADMIN") {
      return NextResponse.json(
        {
          error: `Forbidden: Role '${reviewerRole}' is not authorized to review questions. Faculty review required.`,
        },
        { status: 403 }
      );
    }

    if (!questionId && !runId) {
      return NextResponse.json(
        { error: "Either questionId or runId must be provided." },
        { status: 400 }
      );
    }

    let targetQuestionId = questionId;
    let run = runId ? activeRuns.get(runId) : null;

    if (!targetQuestionId && run && run.candidateDrafts?.[0]?.id) {
      targetQuestionId = run.candidateDrafts[0].id;
    }

    // Determine target database review_status
    let newStatus: string;
    if (action === "REVISION_REQUESTED") {
      newStatus = "REVISION_REQUESTED";
    } else if (action === "REJECT") {
      newStatus = "REJECTED";
    } else {
      newStatus = "APPROVED_FOR_QUESTION_BANK";
    }

    // 1. Authoritative Database Update in PostgreSQL question_bank
    if (targetQuestionId) {
      const dbRes = await queryDb(
        `
        UPDATE question_bank
        SET review_status = $1,
            approved_by_lecturer_id = $2,
            approved_at = NOW()
        WHERE id = $3
        RETURNING id, review_status, approved_at
      `,
        [newStatus, reviewerId, targetQuestionId]
      );

      if (dbRes.rows.length === 0) {
        return NextResponse.json(
          { error: `Question ${targetQuestionId} not found in database.` },
          { status: 404 }
        );
      }
    }

    // 2. Authoritative Database Update in agent_runs if runId provided
    const approvedAtIso = new Date().toISOString();
    if (runId) {
      try {
        await resumeLangGraphWorkflow(runId, reviewerId, action);
      } catch (err: any) {
        logEvent("warn", "LangGraph resumption error", { runId, error: err.message });
      }

      const runStatus = action === "APPROVE" ? "APPROVED" : action;
      await queryDb(
        `
        UPDATE agent_runs
        SET status = $1,
            is_approved = $2,
            approved_by_id = $3,
            approved_at = NOW(),
            approval_comments = $4,
            updated_at = NOW()
        WHERE id = $5
      `,
        [runStatus, action === "APPROVE", reviewerId, comments, runId]
      );

      // Record audit event in PostgreSQL
      await queryDb(
        `
        INSERT INTO agent_audit_events (
          id, run_id, tenant_id, actor_id, actor_role, phase, action, description, risk_level, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, 'APPROVAL', $6, $7, 'LOW', $8, NOW())
      `,
        [
          crypto.randomUUID(),
          runId,
          run?.tenantId || DEMO_CONFIG.tenantId,
          reviewerId,
          reviewerRole,
          action === "APPROVE" ? "SIGN_OFF_DRAFT" : "REQUEST_REVISION",
          `Faculty review action: '${action}'. Comments: "${comments}". Question ${targetQuestionId} updated.`,
          JSON.stringify({ questionId: targetQuestionId, reviewerId, action }),
        ]
      );
    }

    // 3. Update Run State in-memory cache
    if (run) {
      run.isApproved = action === "APPROVE";
      run.status = action === "APPROVE" ? "APPROVED" : action;
      if (run.plan && run.plan[4]) {
        run.plan[4].status = "COMPLETED";
        run.plan[4].outputSummary = `Faculty action '${action}' recorded by ${authUser?.email || DEMO_CONFIG.users.lecturer.name}.`;
      }
      if (run.candidateDrafts?.[0]) {
        run.candidateDrafts[0].reviewStatus = newStatus;
      }
      activeRuns.set(run.runId, run);
    }

    logEvent("info", "Faculty review action completed", {
      runId,
      questionId: targetQuestionId,
      reviewerId,
      action,
      status: newStatus,
    });

    return NextResponse.json({
      success: true,
      message: `Human-in-the-loop ${action.toLowerCase()} recorded successfully.`,
      questionId: targetQuestionId,
      status: action === "APPROVE" ? "APPROVED" : newStatus,
      reviewStatus: newStatus,
      reviewer: {
        id: reviewerId,
        email: authUser?.email || DEMO_CONFIG.users.lecturer.email,
        name: DEMO_CONFIG.users.lecturer.name,
        role: reviewerRole,
      },
      approvedAt: approvedAtIso,
      runState: run || null,
    });
  } catch (error: any) {
    logEvent("error", "Approval error", { error: error.message });
    return NextResponse.json(
      { error: "Failed to record approval", details: error.message },
      { status: 500 }
    );
  }
}
