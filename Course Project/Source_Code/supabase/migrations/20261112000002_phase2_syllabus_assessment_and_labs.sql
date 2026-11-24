-- ==============================================================================
-- Online Examination System — Migration 002: Syllabus, Assessments & Practical Labs
-- ==============================================================================

-- 1. Subjects (e.g. DBMS, SQL, OOP, DSP)
CREATE TABLE IF NOT EXISTS subjects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_code VARCHAR(32) NOT NULL,
    subject_name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_subject UNIQUE (tenant_id, subject_code)
);
CREATE INDEX IF NOT EXISTS idx_subjects_tenant ON subjects(tenant_id);

-- 2. Syllabus Versions (Versioned, immutable curriculum snapshot)
CREATE TYPE syllabus_status_type AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'DEPRECATED');

CREATE TABLE IF NOT EXISTS syllabus_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subject_id UUID NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    version_tag VARCHAR(32) NOT NULL,
    effective_academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    source_document_sha256 VARCHAR(64),
    source_document_filename VARCHAR(255),
    status syllabus_status_type NOT NULL DEFAULT 'DRAFT',
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_subject_syllabus_version UNIQUE (subject_id, version_tag)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_versions_tenant ON syllabus_versions(tenant_id);

-- 3. Course Outcomes (CO)
CREATE TYPE bloom_level_type AS ENUM ('REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE', 'EVALUATE', 'CREATE');

CREATE TABLE IF NOT EXISTS course_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    syllabus_version_id UUID NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    outcome_code VARCHAR(16) NOT NULL, -- e.g. "CO1", "CO2"
    description TEXT NOT NULL,
    bloom_level bloom_level_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_syllabus_co UNIQUE (syllabus_version_id, outcome_code)
);
CREATE INDEX IF NOT EXISTS idx_course_outcomes_syllabus ON course_outcomes(syllabus_version_id);

-- 4. Syllabus Units / Modules
CREATE TABLE IF NOT EXISTS syllabus_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    syllabus_version_id UUID NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    unit_number INT NOT NULL CHECK (unit_number >= 1 AND unit_number <= 20),
    title VARCHAR(255) NOT NULL,
    planned_hours NUMERIC(4, 1) DEFAULT 8.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_syllabus_unit UNIQUE (syllabus_version_id, unit_number)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_units_syllabus ON syllabus_units(syllabus_version_id);

-- 5. Syllabus Topics & Subtopics
CREATE TABLE IF NOT EXISTS syllabus_topics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    unit_id UUID NOT NULL REFERENCES syllabus_units(id) ON DELETE CASCADE,
    topic_code VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    subtopics_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_unit_topic UNIQUE (unit_id, topic_code)
);
CREATE INDEX IF NOT EXISTS idx_syllabus_topics_unit ON syllabus_topics(unit_id);

-- 6. Topic Learning Outcomes (TLO)
CREATE TABLE IF NOT EXISTS topic_learning_outcomes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
    tlo_code VARCHAR(16) NOT NULL,
    description TEXT NOT NULL,
    bloom_level bloom_level_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_topic_tlo UNIQUE (topic_id, tlo_code)
);

-- 7. Topic to Course Outcome (CO) Mapping
CREATE TABLE IF NOT EXISTS topic_outcome_mappings (
    topic_id UUID NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
    course_outcome_id UUID NOT NULL REFERENCES course_outcomes(id) ON DELETE CASCADE,
    PRIMARY KEY (topic_id, course_outcome_id)
);

-- 8. Tools & Frameworks Catalog (Controlled vocabulary)
CREATE TYPE tool_category_type AS ENUM ('DATABASE', 'LANGUAGE', 'CONTAINER', 'FRAMEWORK', 'ANALYSIS_TOOL', 'OTHER');

CREATE TABLE IF NOT EXISTS tool_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE, -- NULL indicates global system tool
    tool_code VARCHAR(64) NOT NULL UNIQUE,
    tool_name VARCHAR(128) NOT NULL,
    category tool_category_type NOT NULL,
    default_version VARCHAR(32) DEFAULT 'latest',
    is_verified BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 9. Lab Practical / Project Tasks
CREATE TYPE submission_mode_type AS ENUM ('FILE_UPLOAD', 'GIT_REPOSITORY', 'SQL_SCRIPT', 'VIVA_ONLY');

CREATE TABLE IF NOT EXISTS lab_practical_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    syllabus_version_id UUID NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    task_code VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    problem_statement TEXT NOT NULL,
    submission_type submission_mode_type NOT NULL DEFAULT 'FILE_UPLOAD',
    max_marks NUMERIC(5, 2) NOT NULL CHECK (max_marks > 0),
    human_review_required BOOLEAN NOT NULL DEFAULT TRUE,
    rubric_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_syllabus_lab_task UNIQUE (syllabus_version_id, task_code)
);

CREATE TABLE IF NOT EXISTS task_topic_mappings (
    task_id UUID NOT NULL REFERENCES lab_practical_tasks(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, topic_id)
);

CREATE TABLE IF NOT EXISTS task_tool_mappings (
    task_id UUID NOT NULL REFERENCES lab_practical_tasks(id) ON DELETE CASCADE,
    tool_id UUID NOT NULL REFERENCES tool_catalog(id) ON DELETE CASCADE,
    PRIMARY KEY (task_id, tool_id)
);

-- 10. Assessment Blueprints (Bound strictly to an exact syllabus version)
CREATE TYPE assessment_category_type AS ENUM (
    'PRACTICE_MOCK',
    'FORMATIVE_QUIZ',
    'INTERNAL_ASSESSMENT',
    'LAB_PRACTICAL',
    'FORMAL_SEMESTER_EXAM'
);

CREATE TYPE blueprint_status_type AS ENUM ('DRAFT', 'PENDING_COE_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TABLE IF NOT EXISTS exam_blueprints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    syllabus_version_id UUID NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE, -- Mandatory
    assessment_type assessment_category_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    total_marks NUMERIC(5, 2) NOT NULL,
    duration_minutes INT NOT NULL CHECK (duration_minutes >= 5 AND duration_minutes <= 360),
    allowed_attempts INT NOT NULL DEFAULT 1 CHECK (allowed_attempts >= 1),
    status blueprint_status_type NOT NULL DEFAULT 'DRAFT',
    sections_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    target_topic_ids_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_exam_blueprints_tenant ON exam_blueprints(tenant_id);

-- 11. Question Bank (Status DRAFT on creation; lecturer approval required)
CREATE TYPE question_review_status_type AS ENUM ('DRAFT', 'APPROVED_FOR_QUESTION_BANK', 'REJECTED', 'REVISION_REQUESTED');

CREATE TABLE IF NOT EXISTS question_bank (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    syllabus_version_id UUID NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    topic_id UUID NOT NULL REFERENCES syllabus_topics(id) ON DELETE CASCADE,
    course_outcome_id UUID REFERENCES course_outcomes(id),
    question_text TEXT NOT NULL,
    question_type VARCHAR(32) NOT NULL,
    options_json JSONB DEFAULT '[]'::jsonb,
    correct_answer TEXT NOT NULL, -- Protected: never exposed to student active session
    marks NUMERIC(4, 2) NOT NULL DEFAULT 1.0,
    difficulty VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
    bloom_level bloom_level_type NOT NULL DEFAULT 'UNDERSTAND',
    source_locator VARCHAR(255) NOT NULL,
    source_excerpt TEXT DEFAULT '',
    review_status question_review_status_type NOT NULL DEFAULT 'DRAFT',
    approved_by_lecturer_id UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_question_bank_tenant ON question_bank(tenant_id);

-- 12. Import Records (Audit provenance of CSV/XLSX imports)
CREATE TYPE import_status_type AS ENUM ('PENDING_VALIDATION', 'VALIDATED_WITH_ERRORS', 'VALIDATED_CLEAN', 'COMMITTED', 'FAILED');

CREATE TABLE IF NOT EXISTS import_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    uploaded_by UUID NOT NULL REFERENCES users(id),
    source_filename VARCHAR(255) NOT NULL,
    source_file_sha256 VARCHAR(64) NOT NULL,
    academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
    status import_status_type NOT NULL DEFAULT 'PENDING_VALIDATION',
    total_rows INT NOT NULL DEFAULT 0,
    imported_rows INT NOT NULL DEFAULT 0,
    error_count INT NOT NULL DEFAULT 0,
    diagnostics_json JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    committed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_import_records_tenant ON import_records(tenant_id);

-- 13. Audit Events (Immutable audit trail)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    resource_type VARCHAR(64) NOT NULL,
    resource_id VARCHAR(64) NOT NULL,
    metadata_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_events_tenant ON audit_events(tenant_id);

-- ==============================================================================
-- Row Level Security (RLS) Configuration
-- ==============================================================================
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE syllabus_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE topic_learning_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE lab_practical_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE question_bank ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_subjects ON subjects
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_syllabus_versions ON syllabus_versions
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_course_outcomes ON course_outcomes
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_syllabus_units ON syllabus_units
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_syllabus_topics ON syllabus_topics
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_topic_learning_outcomes ON topic_learning_outcomes
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_tool_catalog ON tool_catalog
    FOR ALL USING (tenant_id IS NULL OR tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_lab_practical_tasks ON lab_practical_tasks
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_exam_blueprints ON exam_blueprints
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_question_bank ON question_bank
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_import_records ON import_records
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_audit_events ON audit_events
    FOR ALL USING (tenant_id = current_user_tenant_id());
