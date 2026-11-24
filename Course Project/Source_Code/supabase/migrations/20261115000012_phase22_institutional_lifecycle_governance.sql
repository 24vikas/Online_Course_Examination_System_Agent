-- ==============================================================================
-- Migration: 20261115000012_phase22_institutional_lifecycle_governance.sql
-- Description: Phase 22 institutional examination lifecycle, role authority,
--              moderation, grievance adjudication, and proctoring governance.
-- ==============================================================================

-- 1. Extend Enum Types
ALTER TYPE blueprint_status_type ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';
ALTER TYPE user_role_type ADD VALUE IF NOT EXISTS 'INVIGILATOR';
ALTER TYPE user_role_type ADD VALUE IF NOT EXISTS 'SYSTEM_ADMIN';

-- 2. Extend exam_blueprints with submission tracking & revision notes
ALTER TABLE exam_blueprints
  ADD COLUMN IF NOT EXISTS submitted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS revision_notes TEXT;

-- 3. Extend exam_attempts with moderation & result release tracking
ALTER TABLE exam_attempts
  ADD COLUMN IF NOT EXISTS moderated_score NUMERIC,
  ADD COLUMN IF NOT EXISTS moderation_notes TEXT,
  ADD COLUMN IF NOT EXISTS moderated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS results_published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS results_published_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 4. Extend student_grievances with faculty assignment and COE final signoff
ALTER TABLE student_grievances
  ADD COLUMN IF NOT EXISTS assigned_faculty_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coe_decision TEXT,
  ADD COLUMN IF NOT EXISTS coe_approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coe_approved_at TIMESTAMPTZ;

-- 5. Extend exam_proctoring_incidents with invigilator action tracking
ALTER TABLE exam_proctoring_incidents
  ADD COLUMN IF NOT EXISTS action_taken VARCHAR(64),
  ADD COLUMN IF NOT EXISTS action_notes TEXT,
  ADD COLUMN IF NOT EXISTS action_timestamp TIMESTAMPTZ;

-- 6. Create faculty_course_assignments for multi-evaluator course mapping
CREATE TABLE IF NOT EXISTS faculty_course_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
  faculty_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_in_course VARCHAR(64) NOT NULL DEFAULT 'PRIMARY_LECTURER', -- PRIMARY_LECTURER, CO_LECTURER, EVALUATOR
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT unique_faculty_course_assignment UNIQUE (tenant_id, course_offering_id, faculty_id, role_in_course)
);

CREATE INDEX IF NOT EXISTS idx_fca_course ON faculty_course_assignments(tenant_id, course_offering_id);
CREATE INDEX IF NOT EXISTS idx_fca_faculty ON faculty_course_assignments(tenant_id, faculty_id);

-- 7. Add comments for institutional auditing
COMMENT ON TABLE faculty_course_assignments IS 'KLE Tech Authoritative Faculty to Course Offering Assignments for instruction, blueprint drafting, and exam evaluation.';
COMMENT ON COLUMN exam_blueprints.revision_notes IS 'COE feedback notes detailing required revisions before blueprint approval.';
COMMENT ON COLUMN exam_attempts.moderated_score IS 'Authoritative final score after COE statistical moderation or grace marks application.';
COMMENT ON COLUMN student_grievances.assigned_faculty_id IS 'Subject-matter expert faculty assigned by COE to re-evaluate the petitioned question.';
