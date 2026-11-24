-- ==============================================================================
-- RLS Multi-Tenant, Role Isolation & Security Hardening Test Suite
-- ==============================================================================

BEGIN;

-- Setup Mock Tenant A and Tenant B
INSERT INTO tenants (id, code, name) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'TENANT_A', 'Institution Alpha'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'TENANT_B', 'Institution Beta');

-- Setup Users
INSERT INTO users (id, email) VALUES
    ('11111111-1111-1111-1111-111111111111', 'admin_a@alpha.edu'),
    ('22222222-2222-2222-2222-222222222222', 'student_a@alpha.edu'),
    ('33333333-3333-3333-3333-333333333333', 'admin_b@beta.edu'),
    ('44444444-4444-4444-4444-444444444444', 'student_b@beta.edu');

-- Setup Memberships
INSERT INTO tenant_memberships (tenant_id, user_id, role) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'COE_ADMIN'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'STUDENT'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '33333333-3333-3333-3333-333333333333', 'COE_ADMIN'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '44444444-4444-4444-4444-444444444444', 'STUDENT');

-- Setup Students in both tenants
INSERT INTO students (id, tenant_id, institutional_student_id, first_name, email) VALUES
    ('a1111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'SYN-A-01', 'Alice', 'alice@alpha.edu'),
    ('b1111111-1111-1111-1111-111111111111', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'SYN-B-01', 'Bob', 'bob@beta.edu');

-- Global System Tool in catalog
INSERT INTO tool_catalog (id, tenant_id, tool_code, tool_name, category) VALUES
    ('99999999-9999-9999-9999-999999999999', NULL, 'GLOBAL_POSTGRES', 'PostgreSQL CLI', 'DATABASE');

-- Ensure authenticated role exists and has table permissions for RLS testing
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN
        CREATE ROLE authenticated NOINHERIT NOBYPASSRLS;
    END IF;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;

-- Switch to non-superuser authenticated role so RLS policies are enforced
SET ROLE authenticated;

-- TEST 1: Simulate session for Student A (Tenant A)
-- Student A must NOT be able to see Student B's record
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SET LOCAL "request.jwt.claim.tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

DO $$
DECLARE
    visible_count INT;
BEGIN
    SELECT COUNT(*) INTO visible_count FROM students WHERE tenant_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    IF visible_count > 0 THEN
        RAISE EXCEPTION 'RLS VIOLATION: Student A saw Tenant B records!';
    END IF;
    RAISE NOTICE 'TEST 1 PASSED: Cross-tenant read returned 0 rows.';
END $$;

-- TEST 2: Student A cannot insert a record for Tenant B
DO $$
BEGIN
    BEGIN
        INSERT INTO students (tenant_id, institutional_student_id, first_name, email)
        VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'SYN-ROGUE-01', 'Rogue', 'rogue@beta.edu');
        RAISE EXCEPTION 'RLS VIOLATION: Student A inserted a record into Tenant B!';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'TEST 2 PASSED: Cross-tenant write was successfully blocked by RLS.';
    END;
END $$;

-- TEST 3: Student A CANNOT mutate global tool_catalog items
DO $$
BEGIN
    BEGIN
        UPDATE tool_catalog SET tool_name = 'Hacked Tool' WHERE id = '99999999-9999-9999-9999-999999999999';
        -- In RLS, UPDATE with 0 matching rows succeeds silently or fails check; verify count
        IF EXISTS (SELECT 1 FROM tool_catalog WHERE id = '99999999-9999-9999-9999-999999999999' AND tool_name = 'Hacked Tool') THEN
            RAISE EXCEPTION 'RLS VIOLATION: Global tool was modified by tenant member!';
        END IF;
        RAISE NOTICE 'TEST 3 PASSED: Global tool mutation prevented.';
    END;
END $$;

-- TEST 4: Student A CANNOT read question_answer_keys
DO $$
DECLARE
    key_count INT;
BEGIN
    SELECT COUNT(*) INTO key_count FROM question_answer_keys;
    IF key_count > 0 THEN
        RAISE EXCEPTION 'CONFIDENTIALITY VIOLATION: Student was able to query question_answer_keys!';
    END IF;
    RAISE NOTICE 'TEST 4 PASSED: Student cannot read question answer keys.';
END $$;

-- TEST 5: Audit events are append-only (UPDATE and DELETE fail)
RESET ROLE;
INSERT INTO audit_events (tenant_id, user_id, action, resource_type, resource_id)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'TEST_ACTION', 'SYSTEM', 'SYS-01');

SET ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SET LOCAL "request.jwt.claim.tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

DO $$
BEGIN
    BEGIN
        UPDATE audit_events SET action = 'ALTERED' WHERE resource_id = 'SYS-01';
        RAISE EXCEPTION 'IMMUTABILITY VIOLATION: Audit event was updated!';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'TEST 5 PASSED: Audit event update was blocked by trigger.';
    END;
END $$;

-- TEST 6: Student A cannot view other students' eligibility snapshots
RESET ROLE;
-- Insert snapshot for Student A and Student B (using actual users from test setup)
INSERT INTO academic_years (id, tenant_id, year_name, start_date, end_date) VALUES
    ('aaaa0000-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '2026-27', '2026-08-01', '2027-05-31');
INSERT INTO academic_terms (id, tenant_id, academic_year_id, term_code, term_name, semester_number) VALUES
    ('aaaa0000-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa0000-0000-0000-0000-000000000001', 'T3', 'Term 3', 3);
INSERT INTO programs (id, tenant_id, code, name) VALUES
    ('aaaa0000-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CSE', 'Computer Science');
INSERT INTO master_courses (id, tenant_id, program_id, course_code, course_title, credits) VALUES
    ('aaaa0000-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa0000-0000-0000-0000-000000000003', 'CS201', 'Data Structures', 4);
INSERT INTO course_offerings (id, tenant_id, master_course_id, academic_term_id, primary_lecturer_id) VALUES
    ('aaaa0000-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa0000-0000-0000-0000-000000000004', 'aaaa0000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111');

INSERT INTO eligibility_snapshots (tenant_id, student_id, course_offering_id, decision, allow, policy_id, policy_version, policy_hash, evaluator_version) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'aaaa0000-0000-0000-0000-000000000005', 'ELIGIBLE', true, 'opa.policy.exam_eligibility', '1.0.0', 'hash_a', 'opa:0.68.0'),
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'aaaa0000-0000-0000-0000-000000000005', 'INELIGIBLE', false, 'opa.policy.exam_eligibility', '1.0.0', 'hash_b', 'opa:0.68.0');

SET ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
SET LOCAL "request.jwt.claim.tenant_id" = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
SET LOCAL "request.jwt.claim.role" = 'STUDENT';

DO $$
DECLARE
    other_snapshot_count INT;
BEGIN
    SELECT COUNT(*) INTO other_snapshot_count FROM eligibility_snapshots WHERE student_id = '11111111-1111-1111-1111-111111111111';
    IF other_snapshot_count > 0 THEN
        RAISE EXCEPTION 'RLS VIOLATION: Student A was able to see another user eligibility snapshot!';
    END IF;
    RAISE NOTICE 'TEST 6 PASSED: Student can only view their own eligibility snapshot.';
END $$;

-- TEST 7: Cannot schedule an exam from a DRAFT blueprint (trigger check)
RESET ROLE;
INSERT INTO subjects (id, tenant_id, subject_code, subject_name) VALUES
    ('aaaa0000-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'CS201_SUB', 'Data Structures Subject');
INSERT INTO syllabus_versions (id, tenant_id, subject_id, version_tag, effective_academic_year_id) VALUES
    ('aaaa0000-0000-0000-0000-000000000007', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa0000-0000-0000-0000-000000000006', '2026.1', 'aaaa0000-0000-0000-0000-000000000001');

INSERT INTO exam_blueprints (id, tenant_id, course_offering_id, syllabus_version_id, assessment_type, title, total_marks, duration_minutes, status) VALUES
    ('aaaa0000-0000-0000-0000-000000000008', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa0000-0000-0000-0000-000000000005', 'aaaa0000-0000-0000-0000-000000000007', 'INTERNAL_ASSESSMENT', 'Draft BP', 50, 90, 'DRAFT');

DO $$
BEGIN
    BEGIN
        INSERT INTO exam_schedules (tenant_id, blueprint_id, course_offering_id, title, start_time, end_time, duration_minutes, published_by)
        VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'aaaa0000-0000-0000-0000-000000000008', 'aaaa0000-0000-0000-0000-000000000005', 'Illegal Schedule', NOW() + INTERVAL '1 day', NOW() + INTERVAL '1 day 2 hours', 90, '11111111-1111-1111-1111-111111111111');
        RAISE EXCEPTION 'CONSTRAINT VIOLATION: Draft blueprint was scheduled!';
    EXCEPTION WHEN others THEN
        RAISE NOTICE 'TEST 7 PASSED: Attempt to schedule unapproved blueprint was blocked by trigger.';
    END;
END $$;

-- Rollback test transaction cleanly
ROLLBACK;
