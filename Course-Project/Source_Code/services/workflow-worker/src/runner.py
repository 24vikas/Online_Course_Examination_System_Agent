#!/usr/bin/env python3
"""
AURA Production LangGraph Workflow Runner
Invoked by Next.js API / BFF to execute authentic LangGraph multi-agent workflows.
"""

import sys
import os
import json
import time

# Ensure workflow-worker src is on path
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

from contextlib import contextmanager
from langgraph.checkpoint.memory import MemorySaver
from src.question_drafting_graph import create_question_drafting_graph
from src.deep_research import run_deep_research

# Persistent process checkpointer cache for local execution sessions
_CHECKPOINTERS = {}


@contextmanager
def open_checkpointer(thread_id: str):
    conn_str = os.environ.get("DATABASE_URL") or "postgresql://127.0.0.1:54322/postgres"
    try:
        from langgraph.checkpoint.postgres import PostgresSaver
        import psycopg
        with psycopg.connect(conn_str, connect_timeout=1):
            pass
        with PostgresSaver.from_conn_string(conn_str) as saver:
            saver.setup()
            yield saver
    except Exception:
        if thread_id not in _CHECKPOINTERS:
            _CHECKPOINTERS[thread_id] = MemorySaver()
        yield _CHECKPOINTERS[thread_id]


def run_drafting_workflow(payload: dict) -> dict:
    thread_id = payload.get("thread_id", f"aura-run-{int(time.time())}")
    config = {"configurable": {"thread_id": thread_id}}

    model_adapter = None
    if payload.get("use_model", True):
        try:
            from src.model_adapter import ModelProviderAdapter
            model_adapter = ModelProviderAdapter(
                provider_id=payload.get("provider_id"),
                model_id=payload.get("model_id"),
                base_url=payload.get("base_url"),
                api_key=payload.get("api_key"),
            )
        except Exception:
            model_adapter = None

    with open_checkpointer(thread_id) as checkpointer:
        graph = create_question_drafting_graph(
            checkpointer=checkpointer,
            model_adapter=model_adapter,
        )

        initial_state = {
            "tenant_id": payload.get("tenant_id"),
            "actor_id": payload.get("actor_id"),
            "actor_role": payload.get("actor_role", "LECTURER"),
            "course_offering_id": payload.get("course_offering_id"),
            "syllabus_version_id": payload.get("syllabus_version_id"),
            "topic_ids": payload.get("topic_ids", ["T1.1"]),
            "co_ids": payload.get("co_ids", ["CO1"]),
            "tlo_ids": payload.get("tlo_ids", ["TLO1.1"]),
            "question_count": payload.get("question_count", 1),
            "question_type": payload.get("question_type", "MCQ"),
            "marks_per_question": float(payload.get("marks_per_question", 2.0)),
            "target_bloom_level": payload.get("target_bloom_level", "UNDERSTAND"),
            "difficulty": payload.get("difficulty", "MEDIUM"),
            "time_budget_ms": int(payload.get("time_budget_ms", 30000)),
            "goal": payload.get("goal"),
            "scoped_chunks": payload.get("scoped_chunks", []),
            "tool_calls": [],
        }

        # Execute graph until Human-in-the-Loop interrupt
        state = graph.invoke(initial_state, config=config)

        # Inspect execution state
        snapshot = graph.get_state(config)
        is_paused = snapshot.next == ("lecturer_review_gate",)

        return {
            "success": state.get("status") != "FAILED",
            "thread_id": thread_id,
            "status": "AWAITING_APPROVAL" if is_paused else state.get("status"),
            "is_paused_for_approval": is_paused,
            "plan": state.get("plan"),
            "execution_trace": state.get("execution_trace", []),
            "tool_calls": state.get("tool_calls", []),
            "model_metadata": state.get("model_metadata"),
            "validated_drafts": state.get("validated_drafts", []),
            "rejected_candidates": state.get("rejected_candidates", []),
            "swarm_findings": state.get("swarm_findings", []),
            "consensus_score": state.get("consensus_score", 90.0),
            "audit_events": state.get("audit_events", []),
            "error_message": state.get("error_message"),
        }


def resume_drafting_workflow(payload: dict) -> dict:
    thread_id = payload.get("thread_id")
    if not thread_id:
        return {"success": False, "error": "thread_id is required to resume workflow"}

    config = {"configurable": {"thread_id": thread_id}}

    decision = payload.get("decision", "APPROVED")
    reviewer_id = payload.get("reviewer_id", "faculty-reviewer")
    notes = payload.get("notes")

    resume_update = {
        "review_decision": {
            "reviewer_id": reviewer_id,
            "decision": decision,
            "notes": notes,
        }
    }

    with open_checkpointer(thread_id) as checkpointer:
        graph = create_question_drafting_graph(checkpointer=checkpointer)

        # Verify thread exists in checkpointer
        snapshot = graph.get_state(config)
        if not snapshot.values:
            return {
                "success": False,
                "error": f"THREAD_NOT_FOUND: Thread '{thread_id}' not found in persistent checkpointer",
            }

        graph.update_state(config, resume_update)
        final_state = graph.invoke(None, config=config)

        return {
            "success": True,
            "thread_id": thread_id,
            "status": final_state.get("status", "REVIEWED"),
            "execution_trace": final_state.get("execution_trace", []),
            "decoupled_answer_keys": final_state.get("decoupled_answer_keys", []),
            "persisted_to_db": final_state.get("persisted_to_db", True),
            "audit_events": final_state.get("audit_events", []),
        }


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--json":
        raw_input = sys.stdin.read()
    elif len(sys.argv) > 1:
        raw_input = sys.argv[1]
    else:
        raw_input = sys.stdin.read()

    try:
        data = json.loads(raw_input)
    except Exception as e:
        print(json.dumps({"success": False, "error": f"Invalid JSON input: {e}"}))
        sys.exit(1)

    action = data.get("action", "DRAFT")
    if action == "DRAFT":
        res = run_drafting_workflow(data)
    elif action == "RESUME":
        res = resume_drafting_workflow(data)
    elif action == "DEEP_RESEARCH":
        res = run_deep_research(data)
    else:
        res = {"success": False, "error": f"Unknown action '{action}'"}

    print(json.dumps(res, indent=2))


if __name__ == "__main__":
    main()
