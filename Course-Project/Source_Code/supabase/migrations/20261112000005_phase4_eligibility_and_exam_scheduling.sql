-- ==============================================================================
-- Online Examination System — Migration 005: Eligibility Snapshots & Exam Scheduling
-- ==============================================================================

-- 1. Alter exam_blueprints to add rejection reason and updated_at
ALTER TABLE exam_blueprints 
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '',
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- 2. Eligibility Snapshots (Authoritative OPA Evaluation Records)
CREATE TABLE IF NOT EXISTS eligibility_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    decision VARCHAR(32) NOT NULL CHECK (decision IN ('ELIGIBLE', 'INELIGIBLE', 'PENDING_REVIEW', 'UNKNOWN')),
    allow BOOLEAN NOT NULL DEFAULT FALSE,
    reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
    policy_id VARCHAR(64) NOT NULL,
    policy_version VARCHAR(32) NOT NULL,
    policy_hash VARCHAR(128) NOT NULL,
    evaluator_version VARCHAR(64) NOT NULL,
    evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_eligibility_snapshots_lookup 
    ON eligibility_snapshots(tenant_id, course_offering_id, student_id, evaluated_at DESC);

-- 3. Exam Schedules (Governed by COE_ADMIN, derived ONLY from APPROVED Blueprints)
CREATE TYPE exam_schedule_status AS ENUM ('SCHEDULED', 'IN_PROGRESS', 'CONCLUDED', 'CANCELLED');

CREATE TABLE IF NOT EXISTS exam_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    blueprint_id UUID NOT NULL REFERENCES exam_blueprints(id) ON DELETE RESTRICT,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes >= 5 AND duration_minutes <= 360),
    status exam_schedule_status NOT NULL DEFAULT 'SCHEDULED',
    published_by UUID NOT NULL REFERENCES users(id),
    published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_exam_window CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_exam_schedules_tenant 
    ON exam_schedules(tenant_id, course_offering_id, status);

-- 4. Constraint Trigger: Assert that exam_schedules can ONLY reference APPROVED blueprints
CREATE OR REPLACE FUNCTION assert_blueprint_approved_for_schedule()
RETURNS TRIGGER AS $$
DECLARE
    bp_status blueprint_status_type;
BEGIN
    SELECT status INTO bp_status FROM exam_blueprints WHERE id = NEW.blueprint_id;
    IF bp_status IS NULL OR bp_status != 'APPROVED' THEN
        RAISE EXCEPTION 'CANNOT_SCHEDULE_UNAPPROVED_BLUEPRINT: Blueprint % is in status % (must be APPROVED).', NEW.blueprint_id, bp_status;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_assert_blueprint_approved ON exam_schedules;
CREATE TRIGGER trg_assert_blueprint_approved
    BEFORE INSERT OR UPDATE ON exam_schedules
    FOR EACH ROW
    EXECUTE FUNCTION assert_blueprint_approved_for_schedule();

-- 5. Row-Level Security (RLS) Policies
ALTER TABLE eligibility_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_schedules ENABLE ROW LEVEL SECURITY;

-- Eligibility Snapshots RLS:
-- Faculty and COE Admins can view all snapshots within their tenant.
-- Students can ONLY view their own snapshots.
CREATE POLICY eligibility_snapshots_faculty_coe_select
    ON eligibility_snapshots FOR SELECT
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) IN ('COE_ADMIN', 'LECTURER')
    );

CREATE POLICY eligibility_snapshots_student_own_select
    ON eligibility_snapshots FOR SELECT
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND student_id = (current_setting('request.jwt.claim.sub', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) = 'STUDENT'
    );

-- Exam Schedules RLS:
-- Everyone in the tenant can view scheduled exams for their enrolled/assigned courses.
CREATE POLICY exam_schedules_tenant_select
    ON exam_schedules FOR SELECT
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
    );

-- Only COE_ADMIN can create, update, or cancel exam schedules.
CREATE POLICY exam_schedules_coe_admin_modify
    ON exam_schedules FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) = 'COE_ADMIN'
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) = 'COE_ADMIN'
    );
