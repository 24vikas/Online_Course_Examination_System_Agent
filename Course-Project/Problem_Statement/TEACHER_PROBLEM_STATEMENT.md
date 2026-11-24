# TEACHER_PROBLEM_STATEMENT.md — Academic Curriculum Problem Statement & Worklet Specification

**Institution:** KLE Technological University, Hubballi  
**Department:** School of Computer Science & Engineering  
**Course Code & Title:** `26ECAC401` — Agentic AI  
**Academic Year & Semester:** 2026–27, Semester VII  
**Course Authors / Instructors:** Dr. Uday Kulkarni (Author), Dr. Narayan D.G (Reviewer)  
**Team Identity:** Team 5 (Team AURA) &bull; Discipline: CS-AI / CSE  
**Artifact Name:** `Online Course Examination System Agent (apniLeap AURA Coordinator)`  

---

## 1. Course Objectives & Context (From `AAI_26ECAC401.docx`)

As specified in the official institutional syllabus (`FMTH0306/Rev.1.0`), the Agentic AI course (`26ECAC401`) equips final-year students with theoretical and practical foundations to design, develop, govern, and deploy autonomous, goal-directed agent systems.

### Course Outcomes (COs)
1. **CO1:** Explain the foundations, architecture, and planning strategies of agentic AI.
2. **CO2:** Design agentic systems using frameworks, tools, skills, and memory (MCP).
3. **CO3:** Develop multi-agent orchestration using LangGraph and collaborative agents.
4. **CO4:** Analyse safety, governance, and alignment in autonomous agent systems.
5. **CO5:** Build and demonstrate an end-to-end, discipline-specific agentic AI worklet as a course project, with a technical report and presentation.

### Examination Scheme
- **Continuous Internal Evaluation (ISA):** 50 Marks (Laboratory experiments, quizzes, worklet milestone reviews).
- **End Semester Assessment (ESA):** 50 Marks (2-Hour terminal examination).
- **Total Contact Hours:** 58 Hours (30 Lecture hours + 28 Hands-on Laboratory hours across 5 scheduled blocks).

---

## 2. Worklet Problem Statement (Chapter 7: Online Course Examination System Agent)

From the *15 Worklets & 14-Lab Build Book* (Chapter 7: "Online Course Examination System Agent") and *Team 5 Worklet Canvas* (`Team_AURA_Agentic_AI_Worklet_Canvas.pptx`):

### The Core Problem
Traditional university examination systems suffer from severe friction and integrity vulnerabilities:
1. **Manual Assessment Authoring:** Instructors expend dozens of hours authoring exam questions, blueprinting coverage across syllabus units, ensuring Bloom's cognitive balance, and designing distractors.
2. **Hallucination & Provenance Risk:** Standard LLMs (e.g., raw GPT/Gemini chats) hallucinate syllabus content, cite phantom sections, and cannot verify whether a question is truly grounded in course material.
3. **Flawed Autonomous Authority:** Relying on autonomous AI to make high-stakes academic decisions (e.g., student disqualification, timer truncation, or final grading) violates educational governance and procedural fairness.
4. **Proctoring Intrusiveness & False Positives:** Monolithic remote proctoring tools invasively record student environments and unilaterally terminate exams on momentary face tilts or lighting shifts without human invigilator oversight.

### The Team AURA Worklet Challenge
Design, implement, and validate an **autonomous multi-agent coordinator** (`apniLeap AURA Coordinator`) that manages the complete university examination lifecycle while strictly observing **zero-LLM authority** over high-stakes academic records:
- **Eligibility:** Verified deterministically via Open Policy Agent (OPA) against attendance ($\ge 75\%$), fee clearance, and disciplinary status.
- **Assessment Generation:** RAG-grounded question drafting using containerized Docling syllabus extraction and self-hosted 1024-d BAAI/BGE-M3 vector embeddings, coupled with Reflexion self-correction.
- **Operational Authority:** Authoritative timers governed exclusively by PostgreSQL server timestamps; correct answers decoupled and hidden from candidate sessions.
- **Proctoring Telemetry:** Low-privilege companion agent performing edge computer vision (MediaPipe 468+ Mesh, 6-point solvePnP 3D pose, Kabsch identity verification) that emits non-punitive flags without terminating sessions.
- **Human-in-the-Loop Sign-off:** Automated objective scoring by deterministic core; subjective grading and result publication gated strictly behind faculty review and audited Controller of Examinations (COE) sign-off.

---

## 3. Seven Worklet Skills & Fourteen Labs Curriculum Traceability

The project must demonstrate mastery across seven core skills and fourteen hands-on laboratory exercises:

| Skill Domain | Lab ID | Lab Name | Core Academic Concept |
| :--- | :---: | :--- | :--- |
| **Skill 1: Agents** | **L1** | Agent vs Chatbot | Goal-directed state machine vs single-turn LLM response |
| | **L2** | Tool-Using Agent | Typed schema validation, RBAC, path traversal sanitization |
| **Skill 2: Skills** | **L3** | Skill Creation | Versioned reusable skill contracts (`research-summary`) |
| | **L4** | Memory & Retrieval | Ephemeral checkpoints & long-term 1024-d dense retrieval |
| **Skill 3: MCP** | **L5** | Model Context Protocol | Standardized `tools/list` and `tools/call` JSON-RPC interface |
| **Skill 4: OpenCLA** | **L6** | OpenCLA Safe Runtime | Sandboxed runtime lifecycle without host execution privileges |
| **Skill 5: Swarms** | **L7** | Agentic Node Graph | Directed Acyclic Graph (DAG) orchestration using LangGraph |
| | **L8** | Parallel Swarm | Parallel specialized evaluators with consensus and fault tolerance |
| **Skill 6: Deep Research** | **L9** | Deep Research Agent | Multi-hop syllabus decomposition and structured evidence tables |
| **Skill 7: Cloud SDLC** | **L10** | Cloud Operations Agent | Read-only container health diagnostics and approval-gated healing |
| | **L11** | Agentic SDLC Factory | Controlled requirement-to-test and implementation generator |
| | **L12** | Safety & Governance | Action risk classification and immutable append-only audit trail |
| **Capstone Studio** | **L13** | Capstone Studio | End-to-end multi-agent assessment workflow with Reflexion |
| | **L14** | Discipline-Specific Agent | Static code analysis and rubric mapping for CS-AI / CSE |

---

## 4. Submission & Evaluation Deliverables Required

1. **Assignments:** 12 structured assignment directories (`Assignment_01` to `Assignment_12`) covering the core lab concepts.
2. **Course Project Code:** Functional, documented monorepo with zero uncommitted secrets or credentials.
3. **Technical Report:** Comprehensive academic capstone report adhering to the Course Activity rubric (Page 12 of `AAI_26ECAC401.docx`).
4. **Demonstration Media:** Complete step-by-step verification screenshots and data exports proving end-to-end operation.
