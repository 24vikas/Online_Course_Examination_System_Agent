-- ==============================================================================
-- Online Examination System — Migration 006: Exam Attempts, Autosave & Grievances
-- ==============================================================================

-- 1. Exam Attempts
CREATE TYPE exam_attempt_status AS ENUM (
    'IN_PROGRESS',
    'SUBMITTED',
    'EXPIRED',
    'OBJECTIVE_SCORED',
    'FACULTY_REVIEW',
    'RELEASED'
);

CREATE TABLE IF NOT EXISTS exam_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(id) ON DELETE RESTRICT,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    attempt_number INT NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
    status exam_attempt_status NOT NULL DEFAULT 'IN_PROGRESS',
    server_start_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    server_deadline TIMESTAMPTZ NOT NULL,
    submitted_at TIMESTAMPTZ,
    objective_score NUMERIC(5, 2) DEFAULT 0.0,
    subjective_score NUMERIC(5, 2) DEFAULT 0.0,
    total_score NUMERIC(5, 2) DEFAULT 0.0,
    max_marks NUMERIC(5, 2) NOT NULL CHECK (max_marks > 0),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_exam_attempt UNIQUE (tenant_id, exam_schedule_id, student_id, attempt_number)
);

CREATE INDEX IF NOT EXISTS idx_exam_attempts_lookup 
    ON exam_attempts(tenant_id, exam_schedule_id, student_id, status);

-- 2. Attempt Responses (Autosaved Student Answers)
CREATE TABLE IF NOT EXISTS attempt_responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE,
    answer_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    sequence_number INT NOT NULL DEFAULT 1,
    saved_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_attempt_question UNIQUE (attempt_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_attempt_responses_attempt 
    ON attempt_responses(attempt_id, question_id);

-- 3. Integrity Telemetry Signals
CREATE TABLE IF NOT EXISTS attempt_integrity_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    signal_type VARCHAR(32) NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_integrity_signals_attempt 
    ON attempt_integrity_signals(attempt_id, logged_at);

-- 4. Student Grievances
CREATE TYPE grievance_status_type AS ENUM ('SUBMITTED', 'UNDER_FACULTY_REVIEW', 'RESOLVED', 'REJECTED');

CREATE TABLE IF NOT EXISTS student_grievances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id UUID REFERENCES question_bank(id) ON DELETE SET NULL,
    grievance_type VARCHAR(64) NOT NULL,
    statement TEXT NOT NULL,
    status grievance_status_type NOT NULL DEFAULT 'SUBMITTED',
    faculty_remarks TEXT DEFAULT '',
    resolved_by UUID REFERENCES users(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_grievances_lookup 
    ON student_grievances(tenant_id, attempt_id, student_id, status);

-- 5. Row-Level Security
ALTER TABLE exam_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_integrity_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_grievances ENABLE ROW LEVEL SECURITY;

-- Attempt Policies
CREATE POLICY exam_attempts_faculty_select
    ON exam_attempts FOR SELECT
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) IN ('COE_ADMIN', 'LECTURER')
    );

CREATE POLICY exam_attempts_student_select
    ON exam_attempts FOR SELECT
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND student_id = (current_setting('request.jwt.claim.sub', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) = 'STUDENT'
    );

-- Responses Policies
CREATE POLICY attempt_responses_student_manage
    ON attempt_responses FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND EXISTS (
            SELECT 1 FROM exam_attempts a
            WHERE a.id = attempt_id
              AND a.student_id = (current_setting('request.jwt.claim.sub', true))::uuid
              AND a.status = 'IN_PROGRESS'
        )
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND EXISTS (
            SELECT 1 FROM exam_attempts a
            WHERE a.id = attempt_id
              AND a.student_id = (current_setting('request.jwt.claim.sub', true))::uuid
              AND a.status = 'IN_PROGRESS'
        )
    );

CREATE POLICY attempt_responses_faculty_select
    ON attempt_responses FOR SELECT
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) IN ('COE_ADMIN', 'LECTURER')
    );

-- Grievances Policies
CREATE POLICY student_grievances_student_manage
    ON student_grievances FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND student_id = (current_setting('request.jwt.claim.sub', true))::uuid
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND student_id = (current_setting('request.jwt.claim.sub', true))::uuid
    );

CREATE POLICY student_grievances_faculty_manage
    ON student_grievances FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) IN ('COE_ADMIN', 'LECTURER')
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) IN ('COE_ADMIN', 'LECTURER')
    );
