-- ==============================================================================
-- Migration 008: Phase 10 Agent Persistence, Audit Events, and Durable Jobs
-- Project: Online Examination System Agent / apniLeap AURA Coordinator
-- Course: 26ECAC401 (Agentic AI) — KLE Technological University
-- ==============================================================================

-- 1. Agent Runs (Persistent AURA Coordinator Runs)
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    actor_role VARCHAR(32) NOT NULL,
    course_offering_id UUID REFERENCES course_offerings(id),
    topic_code VARCHAR(32),
    goal TEXT NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PLANNING',
    current_step_index INT NOT NULL DEFAULT 0,
    plan_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    retrieved_evidence_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    candidate_drafts_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    critique_findings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    consensus_score INT NOT NULL DEFAULT 0,
    revision_count INT NOT NULL DEFAULT 0,
    max_revisions INT NOT NULL DEFAULT 3,
    approval_required BOOLEAN NOT NULL DEFAULT true,
    is_approved BOOLEAN NOT NULL DEFAULT false,
    approved_by_id UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    approval_comments TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_tenant_status 
    ON agent_runs (tenant_id, status, created_at DESC);

-- 2. Agent Audit Events (Immutable Append-Only Agent Execution Events)
CREATE TABLE IF NOT EXISTS agent_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID REFERENCES agent_runs(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    actor_role VARCHAR(32) NOT NULL,
    phase VARCHAR(32) NOT NULL,
    action VARCHAR(64) NOT NULL,
    description TEXT NOT NULL,
    risk_level VARCHAR(16) NOT NULL DEFAULT 'LOW',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agent_audit_run 
    ON agent_audit_events (run_id, created_at ASC);

-- 3. Durable Background Jobs Queue
CREATE TABLE IF NOT EXISTS background_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    actor_id UUID NOT NULL REFERENCES users(id),
    job_type VARCHAR(64) NOT NULL,
    idempotency_key VARCHAR(128) UNIQUE,
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
    progress_percent INT NOT NULL DEFAULT 0,
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 5,
    lease_token UUID,
    leased_until TIMESTAMPTZ,
    last_error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_background_jobs_queue 
    ON background_jobs (status, leased_until, created_at ASC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE background_jobs ENABLE ROW LEVEL SECURITY;

-- 5. Tenant Isolation Policies
DO $$
BEGIN
    DROP POLICY IF EXISTS tenant_isolation_agent_runs ON agent_runs;
    CREATE POLICY tenant_isolation_agent_runs ON agent_runs
        USING (tenant_id = current_user_tenant_id());

    DROP POLICY IF EXISTS tenant_isolation_agent_audit ON agent_audit_events;
    CREATE POLICY tenant_isolation_agent_audit ON agent_audit_events
        USING (tenant_id = current_user_tenant_id());

    DROP POLICY IF EXISTS tenant_isolation_background_jobs ON background_jobs;
    CREATE POLICY tenant_isolation_background_jobs ON background_jobs
        USING (tenant_id = current_user_tenant_id());
END $$;
