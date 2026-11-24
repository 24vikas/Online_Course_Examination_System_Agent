# Assignment 09: Deep Research Agent with Multi-Source Evidence Tables

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L9** &bull; **Skill 6: Deep Research**  
**Course Outcome (CO):** **CO1, CO2** &bull; **Bloom's Taxonomy:** Level 4 (Analyze) & Level 5 (Evaluate)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Decompose complex academic queries into sub-questions, retrieve multi-source evidence, and synthesize structured evidence tables.

### Theoretical Foundations
Deep research agents recursively break high-level academic concepts into targeted sub-questions. Each retrieved claim is mapped to an exact document locator (file, page, section hash) with confidence metrics and synthesized into an executive report with explicit gap detection.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/deep-research.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/deep-research.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L9" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L9` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Decomposed 'Entity Integrity and Normalization' into 3 sub-questions; generated structured evidence table with citation locators, confidence scores >= 0.9, and synthesized executive summary.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
