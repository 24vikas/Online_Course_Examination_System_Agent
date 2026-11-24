-- ==============================================================================
-- Online Examination System — Migration 001: Core Identity & Academic Structure
-- ==============================================================================

-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Tenants / Institutions
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(32) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Core Users (Shadow auth identities)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tenant Memberships & Roles
CREATE TYPE user_role_type AS ENUM ('COE_ADMIN', 'LECTURER', 'STUDENT');

CREATE TABLE IF NOT EXISTS tenant_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role user_role_type NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_user UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_user ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_memberships_tenant ON tenant_memberships(tenant_id);

-- Helper security functions for RLS session resolution
CREATE OR REPLACE FUNCTION current_user_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM tenant_memberships
    WHERE user_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;

CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role_type AS $$
    SELECT role FROM tenant_memberships
    WHERE user_id = auth.uid()
    LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth;

-- 4. Academic Years (e.g., "AY 2026-27")
CREATE TABLE IF NOT EXISTS academic_years (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    year_name VARCHAR(64) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_year UNIQUE (tenant_id, year_name)
);
CREATE INDEX IF NOT EXISTS idx_academic_years_tenant ON academic_years(tenant_id);

-- 5. Academic Terms / Semesters (e.g., "Odd Term 2026", "Semester III")
CREATE TABLE IF NOT EXISTS academic_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    academic_year_id UUID NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
    term_code VARCHAR(32) NOT NULL,
    term_name VARCHAR(128) NOT NULL,
    semester_number INT NOT NULL CHECK (semester_number >= 1 AND semester_number <= 12),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_term UNIQUE (tenant_id, term_code)
);
CREATE INDEX IF NOT EXISTS idx_academic_terms_tenant ON academic_terms(tenant_id);

-- 6. Programs / Departments
CREATE TABLE IF NOT EXISTS programs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_program UNIQUE (tenant_id, code)
);
CREATE INDEX IF NOT EXISTS idx_programs_tenant ON programs(tenant_id);

-- 7. Batches / Cohorts / Sections (e.g., "CSE-2024-28-SEC-A")
CREATE TABLE IF NOT EXISTS batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    batch_code VARCHAR(64) NOT NULL,
    batch_name VARCHAR(128) NOT NULL,
    admission_year INT NOT NULL CHECK (admission_year >= 2000 AND admission_year <= 2100),
    section VARCHAR(16) DEFAULT 'A',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_batch UNIQUE (tenant_id, batch_code)
);
CREATE INDEX IF NOT EXISTS idx_batches_tenant ON batches(tenant_id);

-- 8. Students (Institutional Profile)
CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    institutional_student_id VARCHAR(64) NOT NULL,
    first_name VARCHAR(128) NOT NULL,
    last_name VARCHAR(128) DEFAULT '',
    email VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_student_id UNIQUE (tenant_id, institutional_student_id)
);
CREATE INDEX IF NOT EXISTS idx_students_tenant ON students(tenant_id);
CREATE INDEX IF NOT EXISTS idx_students_email ON students(email);

-- 9. Student Batch Memberships (Decoupled from course enrolments)
CREATE TYPE batch_membership_status AS ENUM ('ACTIVE', 'COMPLETED', 'TRANSFERRED', 'SUSPENDED');

CREATE TABLE IF NOT EXISTS student_batch_memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    effective_to DATE,
    status batch_membership_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_batch UNIQUE (tenant_id, student_id, batch_id)
);
CREATE INDEX IF NOT EXISTS idx_student_batch_memberships_tenant ON student_batch_memberships(tenant_id);

-- 10. Master Course Catalogue
CREATE TABLE IF NOT EXISTS master_courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    program_id UUID NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
    course_code VARCHAR(32) NOT NULL,
    course_title VARCHAR(255) NOT NULL,
    credits NUMERIC(4, 2) NOT NULL DEFAULT 3.0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_course UNIQUE (tenant_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_master_courses_tenant ON master_courses(tenant_id);

-- 11. Course Offerings (Term/Section/Lecturer instance)
CREATE TABLE IF NOT EXISTS course_offerings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    master_course_id UUID NOT NULL REFERENCES master_courses(id) ON DELETE CASCADE,
    academic_term_id UUID NOT NULL REFERENCES academic_terms(id) ON DELETE CASCADE,
    section VARCHAR(16) NOT NULL DEFAULT 'A',
    primary_lecturer_id UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_tenant_offering UNIQUE (tenant_id, master_course_id, academic_term_id, section)
);
CREATE INDEX IF NOT EXISTS idx_course_offerings_tenant ON course_offerings(tenant_id);

-- 12. Enrollments (Student course registration, strictly distinct from batch)
CREATE TYPE enrollment_status_type AS ENUM ('ENROLLED', 'AUDIT', 'DROPPED', 'WITHDRAWN');

CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    course_offering_id UUID NOT NULL REFERENCES course_offerings(id) ON DELETE CASCADE,
    enrollment_status enrollment_status_type NOT NULL DEFAULT 'ENROLLED',
    registration_date TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_student_course_enrollment UNIQUE (tenant_id, student_id, course_offering_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_tenant ON enrollments(tenant_id);

-- ==============================================================================
-- Row Level Security (RLS) Configuration
-- ==============================================================================
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_batch_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE enrollments ENABLE ROW LEVEL SECURITY;

-- Tenant Isolation Policies: Deny all cross-tenant reads and writes
CREATE POLICY tenant_isolation_tenants ON tenants
    FOR SELECT USING (id = current_user_tenant_id());

CREATE POLICY tenant_isolation_academic_years ON academic_years
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_academic_terms ON academic_terms
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_programs ON programs
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_batches ON batches
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_students ON students
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_student_batch_memberships ON student_batch_memberships
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_master_courses ON master_courses
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_course_offerings ON course_offerings
    FOR ALL USING (tenant_id = current_user_tenant_id());

CREATE POLICY tenant_isolation_enrollments ON enrollments
    FOR ALL USING (tenant_id = current_user_tenant_id());
