import { NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { activeRuns } from "../../../../lib/runs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // 1. Query durable runs from PostgreSQL agent_runs table
    const result = await queryDb(`
      SELECT 
        ar.id AS "runId",
        ar.tenant_id AS "tenantId",
        ar.actor_id AS "actorId",
        ar.actor_role AS "actorRole",
        ar.goal,
        ar.status,
        ar.plan_json AS plan,
        ar.retrieved_evidence_json AS "retrievedEvidence",
        ar.candidate_drafts_json AS "candidateDrafts",
        ar.critique_findings_json AS "critiqueFindings",
        ar.consensus_score AS "consensusScore",
        ar.revision_count AS "revisionCount",
        ar.approval_required AS "approvalRequired",
        ar.is_approved AS "isApproved",
        ar.approved_by_id AS "approvedById",
        ar.approved_at AS "approvedAt",
        ar.approval_comments AS "approvalComments",
        ar.created_at AS "createdAt",
        ar.updated_at AS "updatedAt"
      FROM agent_runs ar
      ORDER BY ar.created_at DESC
      LIMIT 50
    `);

    let runs: any[] = [];

    if (result.rows.length > 0) {
      // Map database rows and attach audit events
      for (const row of result.rows) {
        const eventsRes = await queryDb(
          `SELECT id, run_id AS "runId", phase, actor_role AS actor, action, description, risk_level AS "riskLevel", created_at AS timestamp
           FROM agent_audit_events
           WHERE run_id = $1
           ORDER BY created_at ASC`,
          [row.runId]
        );

        runs.push({
          ...row,
          auditEvents: eventsRes.rows,
        });
      }
    } else {
      // Fallback to activeRuns in-memory map
      runs = Array.from(activeRuns.values()).sort(
        (a: any, b: any) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    return NextResponse.json({
      totalRuns: runs.length,
      runs,
    });
  } catch (error: any) {
    console.error("Failed to query runs from database:", error);
    // Fallback to in-memory cache on error
    const cachedRuns = Array.from(activeRuns.values()).sort(
      (a: any, b: any) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    return NextResponse.json({
      totalRuns: cachedRuns.length,
      runs: cachedRuns,
    });
  }
}
