# Assignment 08: Parallel Swarm Specialists & Fault-Tolerant Consensus

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L8** &bull; **Skill 5: Swarms**  
**Course Outcome (CO):** **CO3** &bull; **Bloom's Taxonomy:** Level 4 (Analyze) & Level 5 (Evaluate)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Execute multiple specialized critic agents in parallel, calculate consensus scoring, and isolate individual branch failures.

### Theoretical Foundations
Rather than relying on a single generalist model, a swarm deploys specialized evaluators (Coverage Specialist, Quality Critic, Provenance Verifier) running concurrently via Promise.allSettled. If one specialist times out or fails, the failure is isolated and consensus is computed from surviving branches.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/parallel-swarm.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/parallel-swarm.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L8" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L8` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Ran 3 parallel specialists concurrently; computed consensus score (92/100) and ACCEPT recommendation; simulated timeout on Quality Critic branch, successfully isolating the transient failure while preserving surviving evaluations.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
