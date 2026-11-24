# Assignment 10: Cloud Operations Agent & Approval-Gated Remediation

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L10** &bull; **Skill 7: Cloud SDLC**  
**Course Outcome (CO):** **CO4** &bull; **Bloom's Taxonomy:** Level 3 (Apply) & Level 4 (Analyze)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Perform read-only container health diagnostics and enforce cryptographic approval tokens before executing remediation.

### Theoretical Foundations
Operational AI agents must follow the principle of least privilege. CloudOperationsAgent performs non-destructive health probing (HTTP /health, port binding). When an outage is detected, it formats an impact assessment and halts; remediation cannot execute without an explicit approval token (APP-OPS-).

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/cloud-ops-agent.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/cloud-ops-agent.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L10" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L10` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Diagnosed simulated failure on embedding-worker (:8002); classified severity as CRITICAL; rejected remediation attempt with INVALID-TOKEN; successfully executed restart upon presentation of valid APP-OPS-RESTART-01 token.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
