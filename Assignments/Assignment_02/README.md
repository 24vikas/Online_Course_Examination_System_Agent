# Assignment 02: Tool-Using Agent & Typed Execution Security

**Course:** `26ECAC401` — Agentic AI, Semester VII, AY 2026–27  
**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering (CS-AI / CSE)  
**Curriculum Mapping:** Lab ID **L2** &bull; **Skill 1: Agents**  
**Course Outcome (CO):** **CO2** &bull; **Bloom's Taxonomy:** Level 3 (Apply) & Level 4 (Analyze)  
**Student Author:** Vikas Umesh Badiger (USN `01FE23BCI094`)  
**Status:** `AUTOMATED_LAB_TEST_EVIDENCE_ATTACHED`  
*(Note on Student Report: Standalone manual PDF/doc write-up marked `MISSING_SOURCE — NOT SUBMITTED`; verified automated implementation and test runner attached).*

---

## 1. Assignment Objectives & Academic Problem Statement

### Objective
Demonstrate typed schema validation, path traversal sanitization, and role-based access control (RBAC) on tool invocations.

### Theoretical Foundations
Exposing arbitrary tool execution to language models introduces critical prompt-injection and privilege escalation vulnerabilities. Typed schemas (Zod) validate inputs before execution, path normalizers reject traversal attacks (../../etc/passwd), and RBAC context strictly prevents students from calling administrative APIs.

---

## 2. System Architecture & Source Implementation

The core implementation for this assignment is integrated into the production-grade AURA codebase:
- **Primary Implementation File:** [`services/api/src/tool-registry.ts`](file:///mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25/services/api/src/tool-registry.ts)
- **Monorepo Package:** `@exam-system/api`
- **Architectural Guardrail:** Strictly adheres to the deterministic authority invariants defined in `AGENTS.md`.

---

## 3. Automated Laboratory Test & Verification

This assignment includes an automated, self-contained test runner that validates all functional and security assertions:

### Verification Command
Run from the root of the project:
```bash
node --test --experimental-strip-types --test-name-pattern="L2" services/api/tests/agentic-worklet.test.ts
```

### Verified Empirical Evidence
- **Test Target:** `L2` suite in `services/api/tests/agentic-worklet.test.ts`
- **Execution Status:** `PASSED` (0 errors, 0 failures)
- **Observed Behavior:** marks_calculator verified question counts and mark sums (20 marks); file_reader successfully rejected '../../etc/passwd' with SECURITY_VIOLATION; student attempt to call academic_api_caller rejected with 403 FORBIDDEN_TOOL_ACCESS.

---

## 4. Student Submission Declaration

- **Implementation Code:** Complete, verified in monorepo codebase.
- **Automated Test Suite:** Passing 100% of functional and security assertions.
- **Academic Integrity:** All code was developed under institutional guidance for KLE Technological University course `26ECAC401`.
