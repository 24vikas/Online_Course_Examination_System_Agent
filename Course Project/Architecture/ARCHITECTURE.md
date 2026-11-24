# ARCHITECTURE.md — System Architecture & Design Specification

## 1. Architectural Philosophy: Serverless-First Modular Monolith

The Online Examination System Agent is architected as a **serverless-first modular monolith** backed by an institutional PostgreSQL database and asynchronous containerized workers. 

To maintain operational simplicity, security, and low maintenance overhead:
- Lightweight web routing, role-based UI presentation, and transactional business requests execute in serverless API Route Handlers and database functions.
- Computationally heavy tasks (deep document layout parsing, OCR, vector embedding generation, LLM-based question drafting, and stateful agent graphs) execute in portable, asynchronous container workers that can scale to zero when idle.
- Canonical state, multi-tenant isolation, and exam lifecycle authority reside strictly within PostgreSQL.

```
+-----------------------------------------------------------------------------------------+
|                                    Client Tier                                          |
|                                                                                         |
|       +-------------------+    +----------------------+    +--------------------+       |
|       |  COE / Admin Portal|    |   Lecturer Portal    |    |   Student Portal   |       |
|       +---------+---------+    +----------+-----------+    +---------+----------+       |
+-----------------|-------------------------|--------------------------|------------------+
                  |                         |                          |
                  +-------------------------+--------------------------+
                                            |
                                            v (HTTPS / Supabase Auth JWT)
+-----------------------------------------------------------------------------------------+
|                        Application & API Tier (Next.js / TypeScript)                    |
|                                                                                         |
|  - Role-based routing & Session Context Verification                                    |
|  - Authenticated Route Handlers (packages/tenant-context)                               |
|  - Authoritative Exam Core API (services/exam-core)                                     |
|  - Eligibility Evaluation Gateway (services/eligibility -> OPA)                         |
|  - Async Job Enqueueing (pgmq / Supabase queues)                                        |
+-------------------------------------------+---------------------------------------------+
                                            |
                 +--------------------------+--------------------------+
                 | (Direct SQL / RLS)                                  | (pgmq durable queue)
                 v                                                     v
+---------------------------------------------+    +--------------------------------------+
|            Canonical Database Tier          |    |     Asynchronous Worker Tier         |
|             (Supabase PostgreSQL)           |    |     (Portable Container Jobs)        |
|                                             |    |                                      |
|  - Strict Multi-Tenant Row Level Security   |    |  1. Document Ingestion Worker        |
|  - Users, Memberships & Role Authorization  |    |     (Docling / Docling Serve)        |
|  - Authoritative Exam Core State Machine    |    |                                      |
|  - Immutable Attempt Submissions & Audits   |    |  2. Question Generation Worker       |
|  - pgvector (Tenant/Course chunk embeddings)|    |     (FastAPI adapter -> vendor/      |
|  - pgmq (Durable async worker queues)       |    |      exam_generator)                 |
|                                             |    |                                      |
|  +---------------------------------------+  |    |  3. Workflow Worker                  |
|  | S3/Supabase Storage (Private Buckets) |  |    |     (LangGraph + Postgres Checkpoints|
|  +---------------------------------------+  |    |      for multi-step research/review) |
+---------------------------------------------+    +--------------------------------------+
```

---

## 2. Multi-Tenancy & Authorization Model

### Tenant Isolation
- Every institution operates as an isolated tenant (`tenants` table).
- Every domain entity carries a `tenant_id` foreign key.
- **Tenant Context Resolution:** The active tenant is derived strictly from the authenticated user's verified session and tenant membership table. Client-supplied headers or body parameters (e.g. `tenant_id` in a JSON payload) are **never** trusted as proof of authorization.
- **Row Level Security (RLS):** All institutional tables have RLS enabled with explicit `RESTRICTIVE` or tenant-matching policies. Negative test suites enforce that cross-tenant read/write attempts fail automatically.

### Role & Membership Separation
- Users (`users`), institutional memberships (`tenant_memberships`), and assigned roles (`COE_ADMIN`, `LECTURER`, `STUDENT`) are strictly decoupled.
- Public self-registration (if enabled) can only provision a baseline identity or student enrollment verification path; it can **never** self-grant `COE_ADMIN` or `LECTURER` privileges.

---

## 3. Subsystem Breakdown

### 3.1 Authoritative Exam Core (`services/exam-core`)
The exam engine is project-owned, deterministic, and database-authoritative:
- **Server-Side Timing:** Start, end, and duration windows are calculated via PostgreSQL server clocks (`CURRENT_TIMESTAMP`), completely ignoring client-reported system times.
- **State Lifecycle:**
  `DRAFT` -> `BLUEPRINT_SUBMITTED` -> `BLUEPRINT_APPROVED` -> `SCHEDULED` -> `IN_PROGRESS` -> `SUBMITTED` -> `OBJECTIVE_SCORED` -> `FACULTY_REVIEW` -> `RELEASED`
- **Eligibility Gate:** A student attempt can only be initiated if an active, affirmative eligibility snapshot is verified by the database.
- **Autosave & Resume:** State updates are idempotent and version-sequenced. Resuming an attempt recalculates remaining time against the immutable server deadline.
- **Submission Freeze:** Submitting an exam immutably locks student responses and prevents further writes.
- **Objective Grading:** Deterministically scored by database triggers or trusted services using exact/range matching.
- **Result Release:** Requires explicit, audited COE administrative authorization.

### 3.2 Eligibility Evaluation Engine (`services/eligibility`, `policies/eligibility`)
- Powered by Open Policy Agent (OPA) evaluating declarative Rego rules.
- Inputs: Student enrollment, academic attendance %, fee clearance, course prerequisites.
- Outputs: Deterministic status (`ELIGIBLE`, `INELIGIBLE`, `PENDING_REVIEW`, `UNKNOWN`) accompanied by stable reason codes.
- Rule: Missing evidence evaluates to `PENDING_REVIEW` or `UNKNOWN`; students are never eligible by default.
- Decisions, policy version hash, evaluator version, and evidence snapshots are immutably persisted for auditability.

### 3.3 Document Ingestion Worker (`services/ingestion-worker`)
- Asynchronously processes institutional documents (PDFs, DOCX, PPTX, XLSX) via Docling / Docling Serve.
- Extracts layout hierarchy, tables, code blocks, mathematical formulae, and reading order.
- Generates chunked passages linked to exact source metadata (`document_id`, `page_number`, `bounding_box`, `content_hash`).
- Chunks are stored in PostgreSQL with pgvector after applying tenant and course identifiers.

### 3.4 Question Generation Worker (`services/question-worker`)
- Wraps the verified MIT-licensed `liuyunc/exam_generator` repository in an authenticated, tenant-aware FastAPI service.
- Accepts strictly typed Pydantic payloads requesting questions (MCQ, short answer, numerical, essay) based on ingested syllabus chunks.
- Maps output questions with provenance citations, estimated Bloom taxonomy levels, and Course Outcomes (CO).
- Sets initial status to `DRAFT`. Questions require explicit lecturer approval before entering the institutional question bank.

### 3.5 Workflow Orchestration Worker (`services/workflow-worker`)
- Built on LangGraph with PostgreSQL checkpointer support.
- Coordinates long-running, multi-step asynchronous workflows (syllabus analysis, question set generation, iterative blueprint balancing).
- Human-in-the-loop pause and resume capabilities using LangGraph interrupts and PostgreSQL checkpoints.
- Maintains strict tenant isolation in graph state.

---

## 4. Operational & Deployment Model

1. **Web & API:** Deployed to serverless edge/Node.js runtimes (e.g., Vercel / Next.js hosting).
2. **Database & Storage:** Managed Supabase (PostgreSQL with extensions: `pgcrypto`, `pgvector`, `pgmq`).
3. **Heavy Workers:** Packaged as portable OCI/Docker containers deployed on container runners (e.g., Fly.io, AWS ECS, or Cloud Run) with autoscaling down to zero.
