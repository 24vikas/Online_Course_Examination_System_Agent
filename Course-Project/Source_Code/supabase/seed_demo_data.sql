-- ==============================================================================
-- KLE Technological University — Course 26ECAC401 (Agentic AI)
-- Synthetic Demo Seed Data for Live Application Verification (Idempotent)
-- ==============================================================================

-- 1. Tenant
INSERT INTO tenants (id, code, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'KLE-TECH-MAIN', 'KLE Technological University')
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, code = EXCLUDED.code;

-- 2. Users (COE Admin, Lecturer, Student)
INSERT INTO users (id, email)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'coe@example.invalid'),
  ('11111111-1111-1111-1111-111111111111', 'uday.kulkarni@example.invalid'),
  ('22222222-2222-2222-2222-222222222222', 'student.aura@example.invalid')
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email;

-- 3. Tenant Memberships
INSERT INTO tenant_memberships (tenant_id, user_id, role)
VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '33333333-3333-3333-3333-333333333333', 'COE_ADMIN'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'LECTURER'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'STUDENT')
ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

-- 4. Academic Year & Term
INSERT INTO academic_years (id, tenant_id, year_name, start_date, end_date)
VALUES ('a0000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'AY 2026-27', '2026-08-01', '2027-05-31')
ON CONFLICT (id) DO NOTHING;

INSERT INTO academic_terms (id, tenant_id, academic_year_id, term_code, term_name, semester_number, is_active)
VALUES ('a0000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000001-0000-0000-0000-000000000001', 'SEM-VII-2026', 'Semester VII', 7, true)
ON CONFLICT (id) DO NOTHING;

-- 5. Program & Batches
INSERT INTO programs (id, tenant_id, code, name)
VALUES ('a0000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'BTECH-CSE', 'B.Tech Computer Science & Engineering')
ON CONFLICT (id) DO NOTHING;

INSERT INTO batches (id, tenant_id, program_id, batch_code, batch_name, admission_year, section)
VALUES ('a0000004-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000003-0000-0000-0000-000000000003', 'CSE-2023-27-SEC-A', 'CSE Batch 2023-27 Section A', 2023, 'A')
ON CONFLICT (id) DO NOTHING;

-- 6. Student Profile
INSERT INTO students (id, tenant_id, institutional_student_id, first_name, last_name, email, is_active)
VALUES ('22222222-2222-2222-2222-222222222222', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'DEMO005', 'Demo Student', 'Team AURA', 'student.aura@example.invalid', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO student_batch_memberships (tenant_id, student_id, batch_id, status)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '22222222-2222-2222-2222-222222222222', 'a0000004-0000-0000-0000-000000000004', 'ACTIVE')
ON CONFLICT (tenant_id, student_id, batch_id) DO NOTHING;

-- 7. Master Course & Subject (26ECAC401: Agentic AI)
INSERT INTO master_courses (id, tenant_id, program_id, course_code, course_title, credits)
VALUES ('a0000005-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'a0000003-0000-0000-0000-000000000003', '26ECAC401', 'Agentic AI', 4.0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO subjects (id, tenant_id, subject_code, subject_name, description)
VALUES ('a0000006-0000-0000-0000-000000000006', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '26ECAC401', 'Agentic AI', 'Foundations, frameworks, multi-agent swarms, safety & capstone')
ON CONFLICT (id) DO NOTHING;

-- 8. Course Offering
INSERT INTO course_offerings (id, tenant_id, master_course_id, academic_term_id, section, primary_lecturer_id, is_active)
VALUES (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'a0000005-0000-0000-0000-000000000005',
  'a0000002-0000-0000-0000-000000000002',
  'A',
  '11111111-1111-1111-1111-111111111111',
  true
)
ON CONFLICT (id) DO NOTHING;

-- 9. Syllabus Version (Insert as DRAFT first so units/topics can be populated)
INSERT INTO syllabus_versions (
  id, tenant_id, subject_id, version_tag, effective_academic_year_id,
  source_document_filename, source_document_sha256, status
)
VALUES (
  '55555555-5555-5555-5555-555555555555',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'a0000006-0000-0000-0000-000000000006',
  'v1.0-APPROVED',
  'a0000001-0000-0000-0000-000000000001',
  'AAI_26ECAC401.docx',
  '547c4485fae3c3e1df77a36253e1263661884f1493e8cee229f9e25db621553c',
  'DRAFT'
)
ON CONFLICT (id) DO UPDATE SET status = 'DRAFT';

-- 10. Course Outcomes (CO1 through CO5)
INSERT INTO course_outcomes (id, tenant_id, syllabus_version_id, outcome_code, description, bloom_level)
VALUES
  ('d0000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'CO1', 'Explain foundations, architecture, and planning strategies of Agentic AI.', 'UNDERSTAND'),
  ('d0000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'CO2', 'Design agentic systems using frameworks, tools, skills, and memory (MCP).', 'APPLY'),
  ('d0000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'CO3', 'Develop multi-agent orchestration using LangGraph and collaborative agents.', 'APPLY'),
  ('d0000004-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'CO4', 'Analyse safety, governance, and alignment in autonomous agent systems.', 'ANALYZE'),
  ('d0000005-0000-0000-0000-000000000005', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 'CO5', 'Build and demonstrate an end-to-end discipline-specific Agentic AI worklet.', 'CREATE')
ON CONFLICT (id) DO NOTHING;

-- 11. Syllabus Units (Unit 1 & Unit 2)
INSERT INTO syllabus_units (id, tenant_id, syllabus_version_id, unit_number, title, planned_hours)
VALUES
  ('b0000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 1, 'Unit I: Foundations of Agentic AI, Frameworks, Tools, Skills & Memory (Chapters 1 & 2)', 15.0),
  ('b0000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '55555555-5555-5555-5555-555555555555', 2, 'Unit II: Multi-Agent Orchestration, Learning Agents, Deployment, Safety & Governance (Chapters 3 & 4)', 15.0)
ON CONFLICT (id) DO NOTHING;

-- 12. Syllabus Topics
INSERT INTO syllabus_topics (id, tenant_id, unit_id, topic_code, title, order_index)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000001-0000-0000-0000-000000000001', 'T1.1', 'Foundations of Agentic AI: Evolution from GenAI to Agentic AI, Agent Lifecycle, Plan-Act-Observe-Improve', 1),
  ('c0000002-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000001-0000-0000-0000-000000000001', 'T1.2', 'Agent Frameworks, Tools, Skills & Memory: LangChain, Tool Calling, MCP Connectors, Short/Long-Term Memory', 2),
  ('c0000003-0000-0000-0000-000000000003', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000002-0000-0000-0000-000000000002', 'T2.1', 'Multi-Agent Orchestration: Distributed Architectures, LangGraph DAGs, Parallel Swarms & Merge Steps', 1),
  ('c0000004-0000-0000-0000-000000000004', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'b0000002-0000-0000-0000-000000000002', 'T2.2', 'Learning Agents & Governance: RLHF/DPO, Reflexion, Human-in-the-Loop, Cloud Ops, Safety & Evaluation', 2)
ON CONFLICT (id) DO NOTHING;

-- 13. Topic Outcome Mappings
INSERT INTO topic_outcome_mappings (topic_id, course_outcome_id)
VALUES
  ('c0000001-0000-0000-0000-000000000001', 'd0000001-0000-0000-0000-000000000001'),
  ('c0000002-0000-0000-0000-000000000002', 'd0000002-0000-0000-0000-000000000002'),
  ('c0000003-0000-0000-0000-000000000003', 'd0000003-0000-0000-0000-000000000003'),
  ('c0000004-0000-0000-0000-000000000004', 'd0000004-0000-0000-0000-000000000004')
ON CONFLICT (topic_id, course_outcome_id) DO NOTHING;

-- 14. Finally approve the syllabus version after units and topics are populated
UPDATE syllabus_versions
SET status = 'APPROVED', approved_by = '33333333-3333-3333-3333-333333333333', approved_at = CURRENT_TIMESTAMP
WHERE id = '55555555-5555-5555-5555-555555555555';
