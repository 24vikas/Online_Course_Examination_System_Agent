# Assignment 11: Agentic SDLC Mini-Factory (Requirement to Test & Diff)

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L11** &bull; **Skill 7: Cloud SDLC**  
**Course Outcome (CO):** **CO3, CO4** &bull; **Bloom's Taxonomy:** Level 4 (Analyze) & Level 6 (Create)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Demonstrate automated transformation of functional requirements into test plans, executable test suites, and Git diffs with human gatekeeping.

### Theoretical Foundations
The Agentic SDLC Factory converts human-authored specifications into decomposed engineering tasks, test plans, and implementation patches. Crucially, the agent is prohibited from self-deploying or merging code into production; it stops at a human reviewer gate.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/agentic-sdlc.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/agentic-sdlc.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L11" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L11` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Transformed 'Course Outcome Blueprint Validation' requirement into 3 decomposed tasks, executable test suite with assert statements, and unified Git diff; verified artifact paused at humanApprovalRequired = true.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
