# Assignment 12: Safety Action Policy, Risk Classification & Audit Trail

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L12** &bull; **Skill 7: Cloud SDLC**  
**Course Outcome (CO):** **CO4** &bull; **Bloom's Taxonomy:** Level 4 (Analyze) & Level 5 (Evaluate)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Classify operational actions into four risk tiers, immediately reject prohibited commands, and log tamper-resistant audit trails.

### Theoretical Foundations
Safety governance enforces strict risk tiers: LOW (read-only, auto-executed), REVERSIBLE (draft generation), HIGH_RISK (publishing schedules or releasing grades, requiring two-party approval), and PROHIBITED (direct shell access, database truncation, immediately rejected and logged).

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/action-policy.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/action-policy.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L12" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L12` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Student attempt to run 'exec_host_shell' on 'host:/bin/sh' immediately blocked as PROHIBITED; lecturer attempt to publish exam schedule gated as HIGH_RISK with approval request APP-; immutable append-only audit trail verified.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
