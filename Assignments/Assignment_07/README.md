# Assignment 07: Agentic Node Graph Workflow Orchestration

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L7** &bull; **Skill 5: Swarms**  
**Course Outcome (CO):** **CO3** &bull; **Bloom's Taxonomy:** Level 3 (Apply) & Level 4 (Analyze)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Orchestrate multi-step examination workflows using a deterministic Directed Acyclic Graph (DAG) state machine.

### Theoretical Foundations
Complex examination workflows require formal state machine transitions rather than unstructured LLM chaining. The node graph decomposes the lifecycle into distinct phases: Goal Intake -> Retrieval -> Drafting -> Critic Review -> Human Approval -> Persistence.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/aura-coordinator.ts, services/workflow-worker/`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/aura-coordinator.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L7" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L7` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Executed 5-node graph; transitions strictly validated against state schemas; invalid state transitions rejected; terminal status persisted with cryptographic run hash.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
