-- ==============================================================================
-- Online Examination System — Migration 003: Security Hardening & Document Pipeline
-- ==============================================================================

-- ==============================================================================
-- 1. AUDIT-01 Remediation: Active Tenant Context Resolution
-- ==============================================================================
CREATE OR REPLACE FUNCTION current_user_tenant_id()
RETURNS UUID AS $$
DECLARE
    v_explicit_tenant TEXT;
    v_tenant_id UUID;
    v_count INT;
BEGIN
    -- 1. Check if an explicit active tenant claim is set in JWT or session
    v_explicit_tenant := NULLIF(current_setting('request.jwt.claim.tenant_id', true), '');
    IF v_explicit_tenant IS NULL THEN
        v_explicit_tenant := NULLIF(current_setting('app.active_tenant_id', true), '');
    END IF;

    IF v_explicit_tenant IS NOT NULL THEN
        -- Verify that authenticated user actually has membership in this explicit tenant
        SELECT tenant_id INTO v_tenant_id
        FROM tenant_memberships
        WHERE user_id = auth.uid()
          AND tenant_id = v_explicit_tenant::UUID
        LIMIT 1;

        RETURN v_tenant_id; -- NULL if user is not a verified member
    END IF;

    -- 2. Fallback: If no explicit tenant claimed, allow only if user has exactly ONE membership
    SELECT COUNT(*), MIN(tenant_id) INTO v_count, v_tenant_id
    FROM tenant_memberships
    WHERE user_id = auth.uid();

    IF v_count = 1 THEN
        RETURN v_tenant_id;
    END IF;

    -- 3. Ambiguous multi-tenant user without explicit claim: fail closed
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role_type AS $$
DECLARE
    v_active_tenant UUID;
    v_role user_role_type;
BEGIN
    v_active_tenant := current_user_tenant_id();
    IF v_active_tenant IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT role INTO v_role
    FROM tenant_memberships
    WHERE user_id = auth.uid()
      AND tenant_id = v_active_tenant
    LIMIT 1;

    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth;


-- ==============================================================================
-- 2. AUDIT-02 Remediation: Tool Catalog & Junction RLS Tightening
-- ==============================================================================
DROP POLICY IF EXISTS tenant_isolation_tool_catalog ON tool_catalog;

-- Global tools (tenant_id IS NULL) and active tenant tools are readable
CREATE POLICY tool_catalog_select ON tool_catalog
    FOR SELECT USING (tenant_id IS NULL OR tenant_id = current_user_tenant_id());

-- Global tools can NEVER be inserted, updated, or deleted by tenant roles
CREATE POLICY tool_catalog_write ON tool_catalog
    FOR ALL
    USING (tenant_id IS NOT NULL AND tenant_id = current_user_tenant_id())
    WITH CHECK (tenant_id IS NOT NULL AND tenant_id = current_user_tenant_id());

-- Enable RLS on junction tables
ALTER TABLE topic_outcome_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_topic_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_tool_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY topic_outcome_mappings_policy ON topic_outcome_mappings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM syllabus_topics t
            WHERE t.id = topic_outcome_mappings.topic_id
              AND t.tenant_id = current_user_tenant_id()
        )
    );

CREATE POLICY task_topic_mappings_policy ON task_topic_mappings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM lab_practical_tasks lpt
            WHERE lpt.id = task_topic_mappings.task_id
              AND lpt.tenant_id = current_user_tenant_id()
        )
    );

CREATE POLICY task_tool_mappings_policy ON task_tool_mappings
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM lab_practical_tasks lpt
            WHERE lpt.id = task_tool_mappings.task_id
              AND lpt.tenant_id = current_user_tenant_id()
        )
    );


-- ==============================================================================
-- 3. AUDIT-03 Remediation: Immutability of Audit Events & Approved Syllabi
-- ==============================================================================
DROP POLICY IF EXISTS tenant_isolation_audit_events ON audit_events;

CREATE POLICY audit_events_select ON audit_events
    FOR SELECT USING (tenant_id = current_user_tenant_id());

CREATE POLICY audit_events_insert ON audit_events
    FOR INSERT WITH CHECK (tenant_id = current_user_tenant_id());

-- Prevent UPDATE or DELETE on audit_events
CREATE OR REPLACE FUNCTION prevent_audit_events_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'SECURITY VIOLATION: audit_events rows are strictly append-only and cannot be mutated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON audit_events;
CREATE TRIGGER trg_prevent_audit_mutation
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_events_mutation();

-- Prevent mutation of syllabus components once status is 'APPROVED'
CREATE OR REPLACE FUNCTION check_syllabus_version_approved()
RETURNS TRIGGER AS $$
DECLARE
    v_status syllabus_status_type;
BEGIN
    IF TG_OP = 'DELETE' THEN
        SELECT status INTO v_status FROM syllabus_versions WHERE id = OLD.syllabus_version_id;
    ELSE
        SELECT status INTO v_status FROM syllabus_versions WHERE id = NEW.syllabus_version_id;
    END IF;

    IF v_status = 'APPROVED' THEN
        RAISE EXCEPTION 'INTEGRITY VIOLATION: Cannot modify units, topics, or outcomes of an APPROVED syllabus version.';
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_approved_syllabus_units ON syllabus_units;
CREATE TRIGGER trg_protect_approved_syllabus_units
    BEFORE INSERT OR UPDATE OR DELETE ON syllabus_units
    FOR EACH ROW EXECUTE FUNCTION check_syllabus_version_approved();


-- ==============================================================================
-- 4. AUDIT-04 Remediation: Separate Confidential Question Answer Keys
-- ==============================================================================
-- Answer keys are physically decoupled from student-facing question rows
CREATE TABLE IF NOT EXISTS question_answer_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES question_bank(id) ON DELETE CASCADE UNIQUE,
    correct_answer TEXT NOT NULL,
    grading_rubric_json JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_question_answer_keys_tenant ON question_answer_keys(tenant_id);

ALTER TABLE question_answer_keys ENABLE ROW LEVEL SECURITY;

-- Students have ZERO access to question_answer_keys
CREATE POLICY answer_keys_faculty_admin_only ON question_answer_keys
    FOR ALL
    USING (
        tenant_id = current_user_tenant_id()
        AND current_user_role() IN ('COE_ADMIN', 'LECTURER')
    )
    WITH CHECK (
        tenant_id = current_user_tenant_id()
        AND current_user_role() IN ('COE_ADMIN', 'LECTURER')
    );

-- Make correct_answer nullable on question_bank as it migrates to question_answer_keys
ALTER TABLE question_bank ALTER COLUMN correct_answer DROP NOT NULL;


-- ==============================================================================
-- 5. Phase 3 Document Ingestion & Chunk Retrieval Entities
-- ==============================================================================

-- 5.1 Ingested Academic Documents (Private Object References)
CREATE TYPE document_status_type AS ENUM ('UPLOADED', 'QUEUED', 'PROCESSING', 'READY', 'FAILED');

CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    syllabus_version_id UUID NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    filename VARCHAR(255) NOT NULL,
    storage_key VARCHAR(512) NOT NULL, -- Private S3/Supabase path (never public URL)
    mime_type VARCHAR(128) NOT NULL,
    file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 104857600), -- 100MB limit
    sha256_hash VARCHAR(64) NOT NULL,
    status document_status_type NOT NULL DEFAULT 'UPLOADED',
    uploaded_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_course_doc_sha UNIQUE (tenant_id, course_offering_id, sha256_hash)
);
CREATE INDEX IF NOT EXISTS idx_documents_tenant_offering ON documents(tenant_id, course_offering_id);

-- 5.2 Document Ingestion Jobs (Durable async job tracking)
CREATE TYPE ingestion_job_status_type AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'RETRY_WAIT');

CREATE TABLE IF NOT EXISTS document_ingestion_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    job_status ingestion_job_status_type NOT NULL DEFAULT 'QUEUED',
    attempt_count INT NOT NULL DEFAULT 0,
    max_attempts INT NOT NULL DEFAULT 3,
    error_code VARCHAR(64),
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_document_ingestion_jobs_tenant ON document_ingestion_jobs(tenant_id, job_status);

-- 5.3 Extracted Document Chunks & Vector Metadata
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    syllabus_version_id UUID NOT NULL REFERENCES syllabus_versions(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INT NOT NULL,
    content TEXT NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    page_start INT NOT NULL CHECK (page_start >= 1),
    page_end INT NOT NULL CHECK (page_end >= page_start),
    section_header VARCHAR(255) DEFAULT '',
    element_type VARCHAR(64) DEFAULT 'paragraph',
    embedding_status VARCHAR(32) DEFAULT 'PENDING',
    embedding_provider VARCHAR(64),
    embedding_model VARCHAR(128),
    embedding_version VARCHAR(32),
    embedding_dimension INT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_doc_chunk_idx UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_document_chunks_scoped_retrieval 
    ON document_chunks(tenant_id, course_offering_id, syllabus_version_id);

-- RLS for Phase 3 Tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_ingestion_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_documents ON documents
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_ingestion_jobs ON document_ingestion_jobs
    FOR ALL USING (tenant_id = current_user_tenant_id());

-- Chunks are readable only by members of the verified tenant
CREATE POLICY tenant_isolation_document_chunks ON document_chunks
    FOR ALL USING (tenant_id = current_user_tenant_id());
