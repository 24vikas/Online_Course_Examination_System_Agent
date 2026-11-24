# Assignment 03: Reusable Skill Contracts & Progressive Disclosure

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L3** &bull; **Skill 2: Skills**  
**Course Outcome (CO):** **CO2** &bull; **Bloom's Taxonomy:** Level 3 (Apply)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Implement versioned, reusable skills with input/output contracts and progressive disclosure of full markdown instructions.

### Theoretical Foundations
Skills package multi-tool workflows into modular, reusable units. Progressive disclosure ensures that the agent's context window is not saturated: metadata and required tools are exposed during discovery, while detailed markdown instructions are loaded on-demand only when a skill is activated.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/skill-registry.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/skill-registry.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L3" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L3` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** research-summary skill (v1.0.0) executed with valid course offering; progressive disclosure loaded full markdown instructions for 'course-document-research'; malformed UUID input rejected with INVALID_SKILL_INPUT.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
