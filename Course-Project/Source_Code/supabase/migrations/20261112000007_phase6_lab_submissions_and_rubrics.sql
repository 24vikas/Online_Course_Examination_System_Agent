-- ==============================================================================
-- Online Examination System — Migration 007: Lab Practical Submissions & Rubrics
-- ==============================================================================

CREATE TYPE lab_submission_status AS ENUM (
    'SUBMITTED',
    'EVALUATED',
    'RESUBMISSION_REQUESTED'
);

CREATE TABLE IF NOT EXISTS lab_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    task_id UUID NOT NULL REFERENCES lab_practical_tasks(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    submission_type submission_mode_type NOT NULL DEFAULT 'FILE_UPLOAD',
    storage_path TEXT,
    submitted_content TEXT NOT NULL,
    status lab_submission_status NOT NULL DEFAULT 'SUBMITTED',
    max_marks NUMERIC(5, 2) NOT NULL DEFAULT 50.0,
    awarded_marks NUMERIC(5, 2),
    evaluator_feedback TEXT DEFAULT '',
    evaluated_by UUID REFERENCES users(id),
    evaluated_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_task_submission UNIQUE (tenant_id, task_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_lab_submissions_lookup 
    ON lab_submissions(tenant_id, task_id, student_id, status);

-- Row-Level Security
ALTER TABLE lab_submissions ENABLE ROW LEVEL SECURITY;

-- Students can insert and manage their own submissions
CREATE POLICY lab_submissions_student_manage
    ON lab_submissions FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND student_id = (current_setting('request.jwt.claim.sub', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) = 'STUDENT'
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND student_id = (current_setting('request.jwt.claim.sub', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) = 'STUDENT'
    );

-- Faculty and COE Admins can view and evaluate submissions
CREATE POLICY lab_submissions_faculty_coe_manage
    ON lab_submissions FOR ALL
    USING (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) IN ('COE_ADMIN', 'LECTURER')
    )
    WITH CHECK (
        tenant_id = (current_setting('request.jwt.claim.tenant_id', true))::uuid
        AND (current_setting('request.jwt.claim.role', true)) IN ('COE_ADMIN', 'LECTURER')
    );
