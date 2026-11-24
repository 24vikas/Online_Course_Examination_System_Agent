import { NextRequest, NextResponse } from "next/server";
import { enqueueJob, leaseNextJob, completeJob, failJob } from "../../../../lib/jobs";
import { resolveAuth } from "../../../../lib/auth";
import { queryDb } from "../../../../lib/db";
import { DEMO_CONFIG } from "../../../../lib/constants";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const jobId = url.searchParams.get("jobId");

    if (jobId) {
      const res = await queryDb(
        `SELECT * FROM background_jobs WHERE id = $1 LIMIT 1`,
        [jobId]
      );
      if (res.rows.length === 0) {
        return NextResponse.json({ error: "Job not found" }, { status: 404 });
      }
      return NextResponse.json({ job: res.rows[0] });
    }

    const res = await queryDb(
      `SELECT * FROM background_jobs ORDER BY created_at DESC LIMIT 25`
    );
    return NextResponse.json({ total: res.rows.length, jobs: res.rows });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const body = await req.json();

    const action = body.action || "ENQUEUE";

    if (action === "ENQUEUE") {
      const tenantId = authUser?.tenantId || body.tenantId || DEMO_CONFIG.tenantId;
      const actorId = authUser?.userId || body.actorId || DEMO_CONFIG.users.lecturer.id;
      const jobType = body.jobType || "BACKGROUND_EMBEDDING_REINDEX";
      const payload = body.payload || {};
      const idempotencyKey = body.idempotencyKey;

      const job = await enqueueJob({
        tenantId,
        actorId,
        jobType,
        payload,
        idempotencyKey,
      });

      return NextResponse.json({ success: true, job });
    }

    if (action === "LEASE") {
      const workerToken = body.workerToken;
      const job = await leaseNextJob(workerToken, body.leaseSeconds || 60);
      return NextResponse.json({ success: true, job });
    }

    if (action === "COMPLETE") {
      const { jobId, leaseToken, progress } = body;
      const ok = await completeJob(jobId, leaseToken, progress || 100);
      return NextResponse.json({ success: ok });
    }

    if (action === "FAIL") {
      const { jobId, leaseToken, errorMessage } = body;
      const ok = await failJob(jobId, leaseToken, errorMessage || "Unknown error");
      return NextResponse.json({ success: ok });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
