# AURA SYSTEM APPENDICES & TECHNICAL SPECIFICATIONS

**Course:** `26ECAC401` — Agentic AI &bull; **Institution:** KLE Technological University, Hubballi  
**System:** AURA (Online Course Examination System)  

---

## APPENDIX A: AGENTS.MD — DETERMINISTIC AUTHORITY INVARIANTS

The foundational security specification of AURA, located at `AGENTS.md` in the repository root:

> **Core Principle:** Independent AI agents and LLM workers must **never** become the source of truth for student records, academic standing, or exam administration. AI workers operate strictly as advisory, drafting, and assistive subsystems.

### Explicit LLM Non-Authority Rules:
1. **Student Eligibility:** Evaluation is performed strictly by Open Policy Agent (OPA) against versioned Rego rules and verified database evidence.
2. **Exam Timing & Clock Authority:** Timers, start/end windows, and session durations are governed exclusively by server-side PostgreSQL timestamps.
3. **Attempt Limits & Registration:** Authorized solely by canonical database constraints and COE schedules.
4. **Answer Keys & Correct Answers:** Correct answers are inaccessible to client-facing APIs and student sessions during an active examination.
5. **Objective Grading:** Deterministically scored by the authoritative `exam-core` engine using exact matching or validated numerical ranges.
6. **Result Publication:** Result release is an audited, manual transaction executed only by an authorized COE administrator.

---

## APPENDIX B: DATABASE SCHEMA & MIGRATION INVENTORY

AURA's data tier is defined by 21 sequential SQL migrations in `supabase/migrations/`:
- `00_init_auth_and_tenancy.sql`: Organization tenants, users, roles, password hashes.
- `01_academic_hierarchy.sql`: Departments, academic years, terms, subjects, course offerings.
- `02_syllabus_and_cos.sql`: Course Outcomes (COs), Bloom levels, Topic Learning Outcomes.
- `05_syllabus_and_vector_chunks.sql`: Ingested documents, markdown chunks, pgvector HNSW index.
- `08_exam_blueprints.sql`: Blueprints, unit weights, CO target mappings, approval triggers.
- `10_question_bank_and_revisions.sql`: Questions, revisions, distractors, chunk provenance.
- `12_exam_schedules_and_rosters.sql`: Schedules, candidate registrations, eligibility snapshots.
- `15_exam_sessions_and_autosave.sql`: Active attempts, authoritative timers, monotonic autosaves.
- `18_proctor_telemetry_and_incidents.sql`: Companion pairing, heartbeat leases, incident events.
- `20_coding_problem_revisions.sql`: Coding challenges, public examples, hidden secret test sets.
- `21_result_moderation_and_release.sql`: Moderated marks, COE release transaction, audit logs.

---

## APPENDIX C: API ROUTE INVENTORY (APPS/WEB)

All 41 Next.js App Router API endpoints compiled and serving on port 33255:
- `/api/auth/login`: Authenticate credentials (Argon2id) and issue signed JWT session.
- `/api/auth/me`: Validate current session and retrieve active role permissions.
- `/api/coding/run`: Execute code against public examples in isolated Bubblewrap sandbox.
- `/api/coding/submit`: Evaluate code against secret hidden test cases inside Bubblewrap.
- `/api/companion/heartbeat`: Ingest 15s companion heartbeat lease.
- `/api/companion/shutdown`: Finalize attempt upon companion termination (anti-forgery protected).
- `/api/companion/reap`: Internal reaper daemon endpoint for sweeping expired sessions.
- `/api/coe/blueprints/approve`: COE ratification endpoint triggering database unlock.
- `/api/coe/schedules/publish`: Publish examination timetable.
- `/api/coe/results/publish`: Atomic result publication transaction.
- `/api/coe/export/roster`: Export candidate roster CSV with CWE-1236 formula sanitization.
- `/api/coe/export/summary`: Export grade distribution summary CSV.
- `/api/faculty/question-bank`: Ingest RAG-drafted questions and manage approvals.
- `/api/student/exam/start`: Verify companion heartbeat lease and initiate exam attempt.
- `/api/student/exam/autosave`: Monotonic response autosave endpoint.
- `/api/student/exam/submit`: Final student submission endpoint.

---

## APPENDIX D: SANITIZED ENVIRONMENT VARIABLE REFERENCE

Required environment variables defined in `.env.example`:
```bash
# Network & Server Topology
PORT=33255
NODE_ENV=production
NEXT_PUBLIC_APP_URL=http://localhost:33255

# Database Configuration (PostgreSQL 15)
PGHOST=127.0.0.1
PGPORT=54322
PGUSER=postgres
PGDATABASE=aura_phase25_integration

# Authentication & JWT Secrets (Dev only; changed in production)
AUTH_SECRET=aura_phase25_jwt_secret_dev_only_change_in_prod_32charsmin
AURA_AUTH_TENANT_ID=dddddddd-dddd-dddd-dddd-dddddddddddd
AURA_REAPER_SECRET=aura_internal_reaper_secret_2026

# Microservice Connectivity Endpoints
DOCLING_SERVE_URL=http://127.0.0.1:5001
BGE_M3_EMBEDDING_URL=http://127.0.0.1:8002
OPA_POLICY_URL=http://127.0.0.1:18181
COMPANION_PORT=4200
```
