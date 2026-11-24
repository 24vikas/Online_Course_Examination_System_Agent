# Assignment 06: OpenCLA Safe Sandboxed Runtime Execution

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L6** &bull; **Skill 4: OpenCLA**  
**Course Outcome (CO):** **CO4** &bull; **Bloom's Taxonomy:** Level 4 (Analyze)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Demonstrate sandboxed runtime session lifecycles and tool allowlisting without granting host shell execution privileges.

### Theoretical Foundations
Autonomous agents must run inside tightly controlled runtime envelopes. SafeOpenCLARuntime governs session lifecycle transitions (INITIALIZED -> ACTIVE -> TERMINATED), enforces strict per-session tool allowlists, logs operational telemetry, and completely blocks host shell or subprocess spawning.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/opencla-runtime.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/opencla-runtime.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L6" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L6` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** Created session with marks_calculator allowlist; successfully executed allowlisted tool; blocked unallowlisted file_reader with SECURITY_VIOLATION; terminated session with complete immutable lifecycle audit log.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
