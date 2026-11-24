# Assignment 05: Model Context Protocol (MCP) Standardized Connector

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L5** &bull; **Skill 3: MCP**  
**Course Outcome (CO):** **CO2** &bull; **Bloom's Taxonomy:** Level 3 (Apply) & Level 4 (Analyze)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Implement standardized Anthropic Model Context Protocol (MCP) JSON-RPC 2.0 interface exposing internal academic tools.

### Theoretical Foundations
MCP defines an open standard for connecting AI agents to external data and tools. The implementation supports initialize, tools/list, tools/call, resources/list, and resources/read with zero-trust server-side session token authentication and cross-tenant spoofing prevention.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/mcp-connector.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/mcp-connector.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L5" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L5` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Handled JSON-RPC 2.0 initialize handshake (v2024-11-05); listed 7 canonical academic tools; executed search_course_material and draft_questions; rejected cross-tenant spoofing with HTTP 403 CROSS_TENANT_VIOLATION.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
