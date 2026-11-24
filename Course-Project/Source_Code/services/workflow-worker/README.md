# Workflow Worker (`services/workflow-worker`)

## Overview

The Workflow Worker orchestrates stateful, long-running agent workflows across academic preparation and examination configuration using **LangGraph** with a **PostgreSQL Checkpointer** (`langgraph-checkpoint-postgres`).

## Key Dependencies (Pinned)
- `langgraph==0.2.74`
- `langgraph-checkpoint-postgres==2.0.18`
- `langchain-core==0.3.43`
- `psycopg[binary,pool]==3.2.5`
- `pydantic==2.10.6`

Upstream LangGraph source code is intentionally **not** cloned into the repository. Instead, official pinned packages are consumed through standard dependency management.

## Stateful Graphs

1. **Academic Research & Note Generation Graph:**
   - Ingests verified course chunks
   - Generates topic summaries and course learning outcome (CO) alignments
   - Checkpointed per tenant and course

2. **Question Drafting & Review Graph:**
   - Prepares multi-level question drafts (Bloom taxonomy, marks, difficulty)
   - Evaluates source provenance against textbook/slide citations
   - Enforces Human-in-the-Loop (HITL) interrupt: pauses execution in PostgreSQL checkpoint until the lecturer approves, modifies, or rejects questions

3. **Exam Blueprint Composition & Balancing Graph:**
   - Validates question bank coverage against unit weights and learning targets
   - Generates audit discrepancy report
   - Enforces COE approval gate before final exam schedule publishing
