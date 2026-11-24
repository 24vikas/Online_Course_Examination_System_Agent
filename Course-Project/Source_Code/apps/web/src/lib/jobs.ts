import { queryDb } from "./db";
import { randomUUID } from "crypto";

export interface BackgroundJob {
  id: string;
  tenantId: string;
  actorId: string;
  jobType: string;
  idempotencyKey?: string;
  payload: Record<string, any>;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED";
  progressPercent: number;
  attemptCount: number;
  maxAttempts: number;
  leaseToken?: string;
  leasedUntil?: string;
  lastErrorMessage?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

/**
 * Enqueues a durable background job.
 */
export async function enqueueJob(params: {
  tenantId: string;
  actorId: string;
  jobType: string;
  payload: Record<string, any>;
  idempotencyKey?: string;
}): Promise<BackgroundJob> {
  const { tenantId, actorId, jobType, payload, idempotencyKey } = params;

  if (idempotencyKey) {
    const existing = await queryDb(
      `SELECT * FROM background_jobs WHERE idempotency_key = $1 LIMIT 1`,
      [idempotencyKey]
    );
    if (existing.rows.length > 0) {
      const r = existing.rows[0];
      return {
        id: r.id,
        tenantId: r.tenant_id,
        actorId: r.actor_id,
        jobType: r.job_type,
        idempotencyKey: r.idempotency_key,
        payload: r.payload,
        status: r.status,
        progressPercent: r.progress_percent,
        attemptCount: r.attempt_count,
        maxAttempts: r.max_attempts,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        completedAt: r.completed_at,
      };
    }
  }

  const result = await queryDb(
    `INSERT INTO background_jobs 
     (tenant_id, actor_id, job_type, idempotency_key, payload, status)
     VALUES ($1, $2, $3, $4, $5, 'QUEUED')
     RETURNING *`,
    [tenantId, actorId, jobType, idempotencyKey || null, JSON.stringify(payload)]
  );

  const r = result.rows[0];
  return {
    id: r.id,
    tenantId: r.tenant_id,
    actorId: r.actor_id,
    jobType: r.job_type,
    idempotencyKey: r.idempotency_key,
    payload: r.payload,
    status: r.status,
    progressPercent: r.progress_percent,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    completedAt: r.completed_at,
  };
}

/**
 * Atomically leases the next eligible QUEUED job.
 */
export async function leaseNextJob(
  workerToken: string = randomUUID(),
  leaseSeconds: number = 60
): Promise<BackgroundJob | null> {
  const leaseInterval = `${leaseSeconds} seconds`;
  const result = await queryDb(
    `UPDATE background_jobs
     SET status = 'PROCESSING',
         lease_token = $1,
         leased_until = CURRENT_TIMESTAMP + INTERVAL '${leaseInterval}',
         attempt_count = attempt_count + 1,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = (
       SELECT id FROM background_jobs
       WHERE status = 'QUEUED' 
          OR (status = 'PROCESSING' AND leased_until < CURRENT_TIMESTAMP)
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [workerToken]
  );

  if (result.rows.length === 0) return null;
  const r = result.rows[0];
  return {
    id: r.id,
    tenantId: r.tenant_id,
    actorId: r.actor_id,
    jobType: r.job_type,
    idempotencyKey: r.idempotency_key,
    payload: r.payload,
    status: r.status,
    progressPercent: r.progress_percent,
    attemptCount: r.attempt_count,
    maxAttempts: r.max_attempts,
    leaseToken: r.lease_token,
    leasedUntil: r.leased_until,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Marks a leased job as successfully completed.
 */
export async function completeJob(
  jobId: string,
  leaseToken: string,
  progress: number = 100
): Promise<boolean> {
  const result = await queryDb(
    `UPDATE background_jobs
     SET status = 'COMPLETED',
         progress_percent = $1,
         completed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP,
         lease_token = NULL
     WHERE id = $2 AND lease_token = $3`,
    [progress, jobId, leaseToken]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Records a job failure, retrying if under max_attempts.
 */
export async function failJob(
  jobId: string,
  leaseToken: string,
  errorMessage: string
): Promise<boolean> {
  const result = await queryDb(
    `UPDATE background_jobs
     SET status = CASE WHEN attempt_count >= max_attempts THEN 'FAILED' ELSE 'QUEUED' END,
         last_error_message = $1,
         lease_token = NULL,
         leased_until = NULL,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 AND lease_token = $3`,
    [errorMessage, jobId, leaseToken]
  );
  return (result.rowCount ?? 0) > 0;
}
