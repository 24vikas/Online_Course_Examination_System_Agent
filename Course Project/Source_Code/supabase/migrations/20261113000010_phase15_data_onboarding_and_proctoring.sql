-- Migration: 20261113000010_phase15_data_onboarding_and_proctoring.sql
-- Description: Phase 15 Academic Data Onboarding, Student Roster/Team Formation, and Host Companion Proctoring Telemetry
-- Author: Team AURA (Team 5), KLE Technological University

-- ============================================================================
-- 1. EXTEND DOCUMENTS & CHUNKS FOR PROVENANCE & RETRIEVAL SCOPING
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'provenance_status') THEN
        ALTER TABLE documents ADD COLUMN provenance_status VARCHAR(32) NOT NULL DEFAULT 'AUTHORITATIVE';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'semester') THEN
        ALTER TABLE documents ADD COLUMN semester INTEGER;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'academic_year') THEN
        ALTER TABLE documents ADD COLUMN academic_year VARCHAR(32);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'document_category') THEN
        ALTER TABLE documents ADD COLUMN document_category VARCHAR(64) NOT NULL DEFAULT 'SYLLABUS';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'superseded_by_document_id') THEN
        ALTER TABLE documents ADD COLUMN superseded_by_document_id UUID REFERENCES documents(id) ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'documents' AND column_name = 'admin_notes') THEN
        ALTER TABLE documents ADD COLUMN admin_notes TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'document_chunks' AND column_name = 'is_active_for_retrieval') THEN
        ALTER TABLE document_chunks ADD COLUMN is_active_for_retrieval BOOLEAN NOT NULL DEFAULT TRUE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_documents_provenance ON documents(tenant_id, course_offering_id, provenance_status);
CREATE INDEX IF NOT EXISTS idx_chunks_active_retrieval ON document_chunks(tenant_id, course_offering_id, is_active_for_retrieval);

-- ============================================================================
-- 2. STUDENT ROSTER CSV IMPORT BATCHES
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_import_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    file_sha256 VARCHAR(64) NOT NULL,
    semester INTEGER,
    total_rows INTEGER NOT NULL DEFAULT 0,
    valid_rows INTEGER NOT NULL DEFAULT 0,
    invalid_rows INTEGER NOT NULL DEFAULT 0,
    imported_rows INTEGER NOT NULL DEFAULT 0,
    column_mapping JSONB NOT NULL DEFAULT '{}'::jsonb,
    validation_report JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(32) NOT NULL DEFAULT 'STAGED', -- STAGED, VALIDATED, COMMITTED, ROLLED_BACK
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    committed_at TIMESTAMPTZ,
    CONSTRAINT chk_import_batch_status CHECK (status IN ('STAGED', 'VALIDATED', 'COMMITTED', 'ROLLED_BACK'))
);

CREATE INDEX IF NOT EXISTS idx_import_batches_tenant ON student_import_batches(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_import_batches_hash ON student_import_batches(tenant_id, file_sha256);

-- ============================================================================
-- 3. STUDENT TEAMS & MEMBERSHIPS (COLLABORATIVE WORKLETS)
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    team_name VARCHAR(128) NOT NULL,
    team_number INTEGER,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT, APPROVED, LOCKED
    allocation_metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_team_status CHECK (status IN ('DRAFT', 'APPROVED', 'LOCKED')),
    CONSTRAINT uq_team_name_offering UNIQUE (tenant_id, course_offering_id, team_name)
);

CREATE INDEX IF NOT EXISTS idx_student_teams_offering ON student_teams(tenant_id, course_offering_id, status);

CREATE TABLE IF NOT EXISTS team_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES student_teams(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'MEMBER', -- LEADER, MEMBER
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_member_role CHECK (role IN ('LEADER', 'MEMBER')),
    CONSTRAINT uq_team_student UNIQUE (team_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_team_memberships_student ON team_memberships(tenant_id, student_id);

-- ============================================================================
-- 4. HOST COMPANION PROCTORING SESSIONS & TELEMETRY
-- ============================================================================

CREATE TABLE IF NOT EXISTS exam_proctoring_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    companion_version VARCHAR(64) NOT NULL,
    companion_os VARCHAR(64) NOT NULL,
    session_token_hash VARCHAR(64) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'IDLE', -- IDLE, PREFLIGHT, CALIBRATING, PROCTOR_READY, IN_EXAM, SUBMITTED, TERMINATED
    face_presence_status VARCHAR(32) DEFAULT 'UNKNOWN',
    head_pose_status VARCHAR(32) DEFAULT 'UNKNOWN',
    gaze_tracking_status VARCHAR(32) DEFAULT 'UNKNOWN',
    identity_status VARCHAR(32) DEFAULT 'BLOCKED_NO_REFERENCE_PHOTO',
    last_heartbeat_at TIMESTAMPTZ,
    calibration_data JSONB DEFAULT '{}'::jsonb,
    telemetry_summary JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_proctor_session_status CHECK (status IN ('IDLE', 'PREFLIGHT', 'CALIBRATING', 'PROCTOR_READY', 'IN_EXAM', 'SUBMITTED', 'TERMINATED')),
    CONSTRAINT uq_attempt_proctor_session UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_proctor_sessions_attempt ON exam_proctoring_sessions(attempt_id, status);

CREATE TABLE IF NOT EXISTS exam_proctoring_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    session_id UUID REFERENCES exam_proctoring_sessions(id) ON DELETE CASCADE,
    incident_type VARCHAR(64) NOT NULL, -- FACE_ABSENT, MULTIPLE_FACES, EXTREME_HEAD_POSE, GAZE_EXCURSION, WINDOW_BLUR, CLIPBOARD_PASTE, SEB_VIOLATION, PROCESS_VIOLATION
    severity VARCHAR(16) NOT NULL DEFAULT 'MEDIUM', -- INFO, LOW, MEDIUM, HIGH, CRITICAL
    confidence_score NUMERIC(4,3) NOT NULL DEFAULT 1.0,
    evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
    review_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW', -- PENDING_REVIEW, FLAGGED, DISMISSED, CONFIRMED_VIOLATION
    reviewer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    reviewer_notes TEXT,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_incident_severity CHECK (severity IN ('INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    CONSTRAINT chk_incident_review_status CHECK (review_status IN ('PENDING_REVIEW', 'FLAGGED', 'DISMISSED', 'CONFIRMED_VIOLATION'))
);

CREATE INDEX IF NOT EXISTS idx_proctor_incidents_attempt ON exam_proctoring_incidents(tenant_id, attempt_id, review_status);
CREATE INDEX IF NOT EXISTS idx_proctor_incidents_severity ON exam_proctoring_incidents(severity, review_status);

-- ============================================================================
-- 5. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

ALTER TABLE student_import_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_proctoring_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_proctoring_incidents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS tenant_isolation_import_batches ON student_import_batches;
    CREATE POLICY tenant_isolation_import_batches ON student_import_batches
        USING (tenant_id = current_user_tenant_id());

    DROP POLICY IF EXISTS tenant_isolation_student_teams ON student_teams;
    CREATE POLICY tenant_isolation_student_teams ON student_teams
        USING (tenant_id = current_user_tenant_id());

    DROP POLICY IF EXISTS tenant_isolation_team_memberships ON team_memberships;
    CREATE POLICY tenant_isolation_team_memberships ON team_memberships
        USING (tenant_id = current_user_tenant_id());

    DROP POLICY IF EXISTS tenant_isolation_proctor_sessions ON exam_proctoring_sessions;
    CREATE POLICY tenant_isolation_proctor_sessions ON exam_proctoring_sessions
        USING (tenant_id = current_user_tenant_id());

    DROP POLICY IF EXISTS tenant_isolation_proctor_incidents ON exam_proctoring_incidents;
    CREATE POLICY tenant_isolation_proctor_incidents ON exam_proctoring_incidents
        USING (tenant_id = current_user_tenant_id());
END $$;
