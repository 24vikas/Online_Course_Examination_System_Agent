# AGENTIC AI FRAMEWORKS INVENTORY & RUNTIME VERIFICATION REPORT
## Empirical Evaluation of Orchestration, Inference, Policy, and Sandboxing Engines

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**System Under Test:** AURA (Autonomous Online Course Examination & Proctoring System)  
**Lead Student Author:** Vikas Umesh Badiger (USN: `01FE23BCI094`)  
**Date of Audit:** November 2026  
**Active Worktree:** `/mnt/data/Agentic_AI_project/Online_Examination_System_INTEGRATION`  
**Git Commit:** `7eee029` (Branch: `integration/phase25-companion-coding`)  

---

## 1. EXECUTIVE SUMMARY

This report provides an exhaustive, evidence-bounded technical inventory and runtime verification ledger of all software frameworks, microservices, and AI engines integrated within AURA. In strict adherence to academic honesty, this report explicitly distinguishes between:
- **Verified Production Modules (PASS):** Fully implemented, executing within containerized or host runtimes, and covered by automated test assertions.
- **Partially Implemented Modules (PARTIAL):** Verified on single-device or staging fixtures; multi-client or physical distributed acceptance pending.
- **Blocked / Host Environment Limitations (BLOCKED):** Dependencies declared in architecture or container definitions but absent or unexecutable directly on the host Python runtime.
- **Comparative Study Frameworks (NOT CLAIMED):** Frameworks studied in the course curriculum (CrewAI, AutoGen, FAISS, Chroma) but intentionally not deployed in AURA's production runtime.

---

## 2. COMPREHENSIVE COMPONENT INVENTORY

| Component | Category | Declared / Observed Version | Monorepo Source Path | Runtime Topology | Operational Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| **LangGraph** | Multi-Agent Orchestration | `>=0.2.70, <0.3.0` | `services/workflow-worker/` | Python worker container / declared | **BLOCKED ON HOST** |
| **LangChain Core** | Agent Message Contracts | `>=0.3.40, <0.4.0` | `services/workflow-worker/` | Python worker container / declared | **BLOCKED ON HOST** |
| **Pydantic** | Schema Validation | `>=2.10, <3.0` | `services/workflow-worker/` | Python runtime | **BLOCKED ON HOST** |
| **AURA MCP Connector** | Protocol Interface | Custom (JSON-RPC 2.0) | `services/api/src/mcp-connector.ts` | In-process TypeScript service | **PASS (100%)** |
| **Docling Serve** | Document Ingestion | Containerized (IBM) | `services/ingestion-worker/` | Docker Container (`:5001`) | **PASS (Healthy)** |
| **BAAI/BGE-M3** | Dense Vector Embeddings | 1024-d Dense | `services/ingestion-worker/` | Docker Container (`:8002`) | **PASS (Healthy)** |
| **PostgreSQL + pgvector** | Relational & Vector DB | PostgreSQL 15 + pgvector | `supabase/migrations/` | Docker Container (`:54322`) | **PASS (Healthy)** |
| **Open Policy Agent (OPA)** | Policy-as-Code Engine | Containerized (Rego) | `services/eligibility/` | Docker Container (`:18181`) | **PASS (Healthy)** |
| **MediaPipe Face Mesh** | Edge Vision Telemetry | 468-point 3D Mesh | `packages/proctor-companion/` | Native Linux Electron / Web | **PASS (Tested)** |
| **Bubblewrap (`bwrap`)** | Sandboxed Execution | Linux CLI (`>=0.8`) | `apps/web/src/lib/coding/` | Host Linux Namespace Sandbox | **PASS (16–25ms)** |
| **Next.js Web Portal** | Full-Stack UI & APIs | Next.js 14.x / React 18 | `apps/web/` | Node.js Daemon (`:33255`) | **PASS (Compiled)** |
| **Zod** | TypeScript Schema | `^3.22.0` | `packages/contracts/` | In-process Monorepo Package | **PASS (Clean)** |
| **Node.js Test Runner** | Automated Harness | Node.js v20.x Built-in | `services/api/tests/` | CLI Test Runner | **PASS (15/15)** |

---

## 3. RUNTIME VERIFICATION EVIDENCE LEDGER

### 3.1 Local Agentic Worklet Verification (15/15 PASS)
- **Command:** `node --test --experimental-strip-types services/api/tests/agentic-worklet.test.ts`
- **Result:** **15 tests passed, 0 failed, 5.326s total duration**
- **Verified Assertions:**
  1. L1: Agent vs Chatbot goal decomposition & approval pause -> PASS (7ms)
  2. L2: Tool registry schema validation, RBAC, path traversal block -> PASS (1ms)
  3. L3: Skill registry versioned contract & disclosure -> PASS (7ms)
  4. L4: Memory retrieval & 1024-d cosine similarity -> PASS (5ms)
  5. L5: Model Context Protocol (MCP) JSON-RPC tools/list and tools/call -> PASS (3ms)
  6. L6: OpenCLA sandboxed execution boundaries -> PASS (1ms)
  7. L7: Node graph DAG state transition & checkpointing -> PASS (1ms)
  8. L8: Parallel swarm specialists & consensus fault tolerance -> PASS (1ms)
  9. L9: Deep research query decomposition & evidence table synthesis -> PASS (1ms)
  10. L10: Cloud ops health telemetry & remediation gate -> PASS (1ms)
  11. L11: Agentic SDLC requirement-to-test and diff pipeline -> PASS (1ms)
  12. L12: Safety risk classification (Low/Medium/Critical) & audit logging -> PASS (1ms)
  13. Tool registry error handling -> PASS (1ms)
  14. Skill registry dependency resolution -> PASS (1ms)
  15. Deep research multi-hop citation integrity -> PASS (1ms)

### 3.2 Isolated Bubblewrap Coding Judge Verification (7/7 PASS)
- **Command:** `node scripts/test_coding_judge_e2e.cjs`
- **Result:** **7 tests passed, 0 failed (100% PASS)**
- **Empirical Findings:**
  - Python code execution latency: **16 ms** (Accepted sum problem)
  - Wrong answer detection: Accurately caught discrepant outputs
  - Execution timeout enforcement: Infinite loop terminated at **404 ms**
  - Runtime error capture: `ZeroDivisionError` cleanly classified
  - Network isolation: Socket creation blocked by `--unshare-all`
  - Scoring modes: Both Weighted (7.5/10) and All-or-Nothing (0/10) verified

### 3.3 Companion Security & Anti-Forgery Hardening (8/8 PASS)
- **Command:** `node scripts/test_security_hardening.cjs`
- **Result:** **8 tests passed, 0 failed (100% PASS)**
- **Empirical Findings:**
  - Cross-student attempt shutdown rejected with HTTP 403 Forbidden
  - Identity spoofing blocked with HTTP 403 Forbidden
  - Idempotency verified: 5 concurrent shutdown calls execute exactly 1 finalization
  - 15-second heartbeat expiry auto-finalizes and locks attempt
  - Background reaper daemon sweeps and reaps stale sessions
  - Audited COE recovery (`RESUME_EXAM`) safely unlocks session

### 3.4 Full Lifecycle E2E Integration Suite (6/6 PASS)
- **Command:** `node scripts/verify_phase25_integration_e2e.cjs`
- **Result:** **6 stages verified with 100% PASS**
- **Empirical Findings:**
  - Authenticated 4 personas: COE Admin, Faculty, Student, Invigilator
  - Unauthorized coding execution denied (HTTP 404/403)
  - Sandbox execution verified in 18ms
  - COE Candidate Roster CSV exported (3,023 rows)
  - COE Summary CSV exported (27,593 bytes)
  - CWE-1236 spreadsheet injection protection verified

---

## 4. HONEST REPORTING OF SYSTEM LIMITATIONS

In strict accordance with scientific integrity:

1. **Python Workflow Worker (BLOCKED ON HOST):** The dependencies `langgraph`, `langchain-core`, and `pydantic` are declared in `services/workflow-worker/requirements.txt` for containerized execution. However, they are absent from the host Python environment (`importlib.metadata.PackageNotFoundError`). Full containerized workflow worker deployment is scheduled for Phase 26.
2. **Fresh Live PDF Ingestion (NOT RUN IN CURRENT PASS):** While the Docling container (port 5001) and BGE-M3 container (port 8002) are healthy and verified, fresh live browser-driven PDF uploads were verified in prior staging ledgers (CP3) and were not re-executed during this academic test pass.
3. **Physical Multi-Device Camera Test (PARTIAL):** Real physical webcam and microphone capture were verified on a single Ubuntu workstation. Live pairing across two physically separated laptops communicating over a university LAN remains to be demonstrated.
4. **Cohort Concurrency Load Testing (NOT RUN):** While individual execution latency measures 16–25ms, stress-testing under a simulated cohort of 200–400 concurrent students has not been executed.
5. **Comparative Frameworks (NOT CLAIMED):** CrewAI, Microsoft AutoGen, FAISS, Chroma, and Qdrant were analyzed theoretically in the curriculum but are not deployed in AURA's production runtime.
