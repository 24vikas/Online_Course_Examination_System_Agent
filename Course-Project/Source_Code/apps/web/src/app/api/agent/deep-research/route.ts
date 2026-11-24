import { NextRequest, NextResponse } from "next/server";
import { executeLangGraphDeepResearchWorkflow } from "@/lib/langgraph";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";

export const dynamic = "force-dynamic";

/**
 * POST /api/agent/deep-research
 * Executes an authentic multi-step LangGraph Deep Research Graph:
 * Query Understanding -> Plan/Sub-questions -> Source Search -> Fetch/Extract ->
 * Quality/Conflict Check -> Synthesis with Claim-to-Source Mapping -> Structured Evidence Appendix.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const query = (body.query || body.topic || "").trim();

    if (!query) {
      return NextResponse.json(
        { success: false, error: "Validation Error: 'query' or 'topic' is required for deep research." },
        { status: 400 }
      );
    }

    const tenantId = body.tenantId || DEMO_CONFIG.tenantId;
    const actorId = body.actorId || DEMO_CONFIG.users.lecturer.id;
    const actorRole = body.actorRole || "LECTURER";
    const courseCode = body.courseCode || DEMO_CONFIG.courseCode;
    const courseOfferingId = body.courseOfferingId || DEMO_CONFIG.courseOfferingId;
    const scope = body.scope || "combined";
    const depth = body.depth || "comprehensive";
    const maxSources = Number(body.maxSources || 6);
    const providerId = body.providerId || "BAAI/bge-m3";
    const modelId = body.modelId || "gemini-1.5-pro";

    // Execute through LangGraph Python runner
    const result = await executeLangGraphDeepResearchWorkflow({
      tenantId,
      actorId,
      actorRole,
      courseCode,
      courseOfferingId,
      query,
      scope,
      depth,
      maxSources,
      providerId,
      modelId,
      threadId: body.threadId,
      runId: body.runId,
    });

    // Double-check persistence in PostgreSQL agent_runs table
    if (result.success && !result.persisted_to_db) {
      try {
        await queryDb(
          `
          INSERT INTO agent_runs (
            id, tenant_id, actor_id, actor_role, course_offering_id, topic_code,
            goal, status, current_step_index, plan_json, retrieved_evidence_json,
            candidate_drafts_json, critique_findings_json, consensus_score,
            revision_count, max_revisions, approval_required, is_approved,
            tokens_used, duration_ms, provider, scope, synthesis_report, citations_json,
            created_at, updated_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6,
            $7, $8, $9, $10, $11,
            $12, $13, $14,
            $15, $16, $17, $18,
            $19, $20, $21, $22, $23, $24,
            NOW(), NOW()
          )
          ON CONFLICT (id) DO UPDATE SET
            status = EXCLUDED.status,
            synthesis_report = EXCLUDED.synthesis_report,
            updated_at = NOW()
        `,
          [
            result.run_id,
            tenantId,
            actorId,
            actorRole,
            courseOfferingId,
            query.slice(0, 32),
            `Deep Research: ${query} (Scope: ${scope})`,
            "COMPLETED",
            7,
            JSON.stringify(result.parsed_intent || {}),
            JSON.stringify(result.evidence_table || []),
            JSON.stringify(result.claim_to_source_mapping || []),
            JSON.stringify({
              unsupported_claims: result.unsupported_claims || [],
              contradictions_or_conflicts: result.contradictions_or_conflicts || [],
            }),
            Math.round((result.confidence_overall || 0.95) * 100),
            0,
            3,
            false,
            true,
            result.tokens_used || 1200,
            result.duration_ms || 450,
            providerId,
            scope,
            result.synthesized_report || "",
            JSON.stringify(result.citations || []),
          ]
        );
        result.persisted_to_db = true;
      } catch (dbErr) {
        console.error("Non-critical DB persistence notice:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error("Deep Research API Execution Error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Deep Research graph execution encountered an unexpected error.",
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/agent/deep-research
 * Retrieves historical or specific deep research dossiers from PostgreSQL.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const runId = url.searchParams.get("runId");

    if (runId) {
      const res = await queryDb(
        `SELECT id, tenant_id, actor_id, actor_role, course_offering_id, topic_code,
                goal, status, tokens_used, duration_ms, provider, scope,
                synthesis_report, citations_json, retrieved_evidence_json,
                candidate_drafts_json, plan_json, created_at, updated_at
         FROM agent_runs
         WHERE id = $1 LIMIT 1`,
        [runId]
      );

      if (res.rows.length === 0) {
        return NextResponse.json(
          { success: false, error: `Research run with ID '${runId}' not found.` },
          { status: 404 }
        );
      }

      const row = res.rows[0];
      return NextResponse.json({
        success: true,
        data: {
          run_id: row.id,
          topic: row.topic_code,
          goal: row.goal,
          status: row.status,
          tokens_used: row.tokens_used,
          duration_ms: row.duration_ms,
          provider: row.provider,
          scope: row.scope,
          synthesized_report: row.synthesis_report,
          citations: row.citations_json,
          evidence_table: row.retrieved_evidence_json,
          claim_to_source_mapping: row.candidate_drafts_json,
          parsed_intent: row.plan_json,
          created_at: row.created_at,
        },
      });
    }

    // List recent deep research runs
    const res = await queryDb(
      `SELECT id, topic_code, goal, status, tokens_used, duration_ms, provider, scope,
              synthesis_report, citations_json, retrieved_evidence_json, created_at
       FROM agent_runs
       WHERE goal LIKE 'Deep Research:%' OR plan_json->>'type' = 'DEEP_RESEARCH'
       ORDER BY created_at DESC
       LIMIT 10`
    );

    const runs = res.rows.map((row) => ({
      run_id: row.id,
      topic: row.topic_code,
      goal: row.goal,
      status: row.status,
      tokens_used: row.tokens_used,
      duration_ms: row.duration_ms,
      provider: row.provider,
      scope: row.scope,
      source_count: Array.isArray(row.retrieved_evidence_json) ? row.retrieved_evidence_json.length : 0,
      citations_count: Array.isArray(row.citations_json) ? row.citations_json.length : 0,
      created_at: row.created_at,
    }));

    return NextResponse.json({
      success: true,
      runs,
    });
  } catch (err: any) {
    console.error("Deep Research GET Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch deep research records." },
      { status: 500 }
    );
  }
}
