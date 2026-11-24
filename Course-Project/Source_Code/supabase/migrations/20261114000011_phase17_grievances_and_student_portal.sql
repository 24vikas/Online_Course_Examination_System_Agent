-- Migration: 20261114000011_phase17_grievances_and_student_portal.sql
-- Description: Phase 17 Academic Grievance Workflow, Practice Exams, and Study Hub Persistence
-- Author: Team AURA (Team 5), CS-AI / CSE, KLE Technological University

-- ============================================================================
-- 1. EXTEND STUDENT GRIEVANCES FOR REVALUATION WORKFLOW
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'subject') THEN
        ALTER TABLE student_grievances ADD COLUMN subject VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'exam_title') THEN
        ALTER TABLE student_grievances ADD COLUMN exam_title VARCHAR(255);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'question_key') THEN
        ALTER TABLE student_grievances ADD COLUMN question_key VARCHAR(128);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'current_marks') THEN
        ALTER TABLE student_grievances ADD COLUMN current_marks NUMERIC(6,2) NOT NULL DEFAULT 0.0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'requested_marks') THEN
        ALTER TABLE student_grievances ADD COLUMN requested_marks NUMERIC(6,2) NOT NULL DEFAULT 0.0;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'new_awarded_marks') THEN
        ALTER TABLE student_grievances ADD COLUMN new_awarded_marks NUMERIC(6,2);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'syllabus_reference') THEN
        ALTER TABLE student_grievances ADD COLUMN syllabus_reference TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_grievances' AND column_name = 'ai_analysis') THEN
        ALTER TABLE student_grievances ADD COLUMN ai_analysis JSONB DEFAULT '{}'::jsonb;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'exam_attempts' AND column_name = 'is_practice') THEN
        ALTER TABLE exam_attempts ADD COLUMN is_practice BOOLEAN NOT NULL DEFAULT FALSE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_student_grievances_status ON student_grievances(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_exam_attempts_practice ON exam_attempts(tenant_id, is_practice);

-- ============================================================================
-- 2. ACADEMIC STUDY NOTES & REVISION ARTIFACTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS student_study_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_code VARCHAR(64) NOT NULL,
    topic VARCHAR(128) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_student_study_notes ON student_study_notes(tenant_id, student_id, course_code);

ALTER TABLE student_study_notes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS tenant_isolation_student_study_notes ON student_study_notes;
    CREATE POLICY tenant_isolation_student_study_notes ON student_study_notes
        USING (tenant_id = current_user_tenant_id());
END $$;
