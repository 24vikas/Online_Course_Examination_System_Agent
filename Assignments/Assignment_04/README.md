# Assignment 04: Memory Architecture & Long-Term Vector Retrieval

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L4** &bull; **Skill 2: Skills**  
**Course Outcome (CO):** **CO2** &bull; **Bloom's Taxonomy:** Level 3 (Apply) & Level 4 (Analyze)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Demonstrate short-term state persistence across pause/resume cycles and long-term 1024-d BAAI/BGE-M3 vector retrieval.

### Theoretical Foundations
Agent memory divides into short-term execution checkpoints (preserving run state while awaiting human approval) and long-term dense vector retrieval (grounded syllabus chunks). Retrieval must enforce strict multi-tenant and course-offering boundaries to prevent data leakage.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/ingestion-worker/src/retrieval-service.ts, services/api/src/aura-coordinator.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/ingestion-worker/src/retrieval-service.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L4" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L4` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** AuraCoordinator paused run in AWAITING_APPROVAL; lecturer approved run hours later; run transitioned to COMPLETED and generated draft-bp- without re-executing completed planning steps.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
