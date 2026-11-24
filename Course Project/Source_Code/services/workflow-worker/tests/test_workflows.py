"""
Unit and Integration Tests for Workflow Worker LangGraph Graphs.
Tests both Ingestion Graph and Question Drafting Graph with HITL gating and tenant isolation.
"""

import pytest
import sys
import os
import time

# Ensure services/workflow-worker is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from langgraph.checkpoint.memory import MemorySaver
from src.ingestion_graph import create_ingestion_graph
from src.question_drafting_graph import create_question_drafting_graph


def test_ingestion_graph_happy_path():
    """Verifies that a valid document is extracted, chunked, and finalized as READY."""
    checkpointer = MemorySaver()
    graph = create_ingestion_graph(checkpointer=checkpointer)

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "user_id": "usr-faculty-01",
        "course_offering_id": "co-cs101-2026-even",
        "syllabus_version_id": "syl-v1-cs101",
        "document_id": "doc-syllabus-cs101",
        "storage_path": "tenant-kle-tech/courses/cs101/syllabus.md",
        "mime_type": "text/markdown",
        "file_size_bytes": 1024,
        "raw_content": (
            b"# Unit 1: Introduction\n"
            b"Fundamentals of algorithmic problem solving.\n\n"
            b"## Topic 1.1: Asymptotic Analysis\n"
            b"Big-O, Omega, and Theta notations with formal definitions.\n\n"
            b"### Unit 2: Data Structures\n"
            b"Balanced binary search trees, B-trees, and heaps."
        ),
    }

    config = {"configurable": {"thread_id": "thread-ingest-01"}}
    final_state = graph.invoke(initial_state, config=config)

    assert final_state["status"] == "READY"
    assert len(final_state["chunks"]) >= 2
    assert final_state["chunks"][0]["tenant_id"] == "tenant-kle-tech"
    assert final_state["chunks"][0]["heading_context"] == "Unit 1: Introduction"
    assert "section_hash" in final_state["chunks"][0]
    assert len(final_state["audit_events"]) == 1
    assert final_state["audit_events"][0]["action"] == "DOCUMENT_INGESTION_COMPLETED"


def test_ingestion_graph_validation_failure_empty_tenant():
    """Verifies fail-closed behavior when tenant_id is missing or empty."""
    graph = create_ingestion_graph()

    initial_state = {
        "tenant_id": "",  # Empty tenant!
        "user_id": "usr-faculty-01",
        "course_offering_id": "co-cs101",
        "syllabus_version_id": "syl-01",
        "document_id": "doc-01",
        "storage_path": "path/file.pdf",
        "mime_type": "application/pdf",
        "file_size_bytes": 1024,
    }

    result = graph.invoke(initial_state)
    assert result["status"] == "FAILED"
    assert "tenant_id is required" in result["error_message"]
    assert result["audit_events"][0]["action"] == "DOCUMENT_INGESTION_FAILED"


def test_ingestion_graph_unsupported_mime_type():
    """Verifies rejection of unapproved binary/executable MIME types."""
    graph = create_ingestion_graph()

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "user_id": "usr-faculty-01",
        "course_offering_id": "co-cs101",
        "syllabus_version_id": "syl-01",
        "document_id": "doc-01",
        "storage_path": "path/malicious.exe",
        "mime_type": "application/x-dosexec",
        "file_size_bytes": 1024,
    }

    result = graph.invoke(initial_state)
    assert result["status"] == "FAILED"
    assert "UNSUPPORTED_MIME_TYPE" in result["error_message"]


def test_ingestion_graph_payload_too_large():
    """Verifies rejection of files exceeding the 50MB bound."""
    graph = create_ingestion_graph()

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "user_id": "usr-faculty-01",
        "course_offering_id": "co-cs101",
        "syllabus_version_id": "syl-01",
        "document_id": "doc-01",
        "storage_path": "path/large.pdf",
        "mime_type": "application/pdf",
        "file_size_bytes": 60 * 1024 * 1024,  # 60MB
    }

    result = graph.invoke(initial_state)
    assert result["status"] == "FAILED"
    assert "PAYLOAD_TOO_LARGE" in result["error_message"]


def test_question_drafting_graph_happy_path_hitl_interrupt():
    """
    Verifies that question drafting:
    1. Validates lecturer actor and syllabus-scoped chunks
    2. Generates draft questions with provenance
    3. Enforces HITL interrupt before lecturer review gate
    4. Resumes upon lecturer review action
    """
    checkpointer = MemorySaver()
    graph = create_question_drafting_graph(checkpointer=checkpointer)

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-prof-sharma",
        "actor_role": "LECTURER",
        "course_offering_id": "co-cs101-2026-even",
        "syllabus_version_id": "syl-v1-cs101",
        "topic_ids": ["topic-asymptotic-notation"],
        "co_ids": ["co-1"],
        "tlo_ids": ["tlo-1.1"],
        "question_count": 2,
        "question_type": "MCQ",
        "marks_per_question": 2.0,
        "target_bloom_level": "APPLY",
        "difficulty": "MEDIUM",
        "scoped_chunks": [
            {
                "chunk_id": "chk_doc_001_000",
                "tenant_id": "tenant-kle-tech",
                "course_offering_id": "co-cs101-2026-even",
                "syllabus_version_id": "syl-v1-cs101",
                "document_id": "doc_001",
                "page_start": 12,
                "heading_context": "Big-O and Theta Complexity Bounds",
                "content": "Algorithm complexity bounds for sorting algorithms.",
            }
        ],
    }

    config = {"configurable": {"thread_id": "drafting-session-101"}}

    # Execute graph - should halt before lecturer_review_gate
    paused_state = graph.invoke(initial_state, config=config)

    assert paused_state["status"] == "DRAFT_READY_FOR_REVIEW"
    assert len(paused_state["validated_drafts"]) == 2
    draft1 = paused_state["validated_drafts"][0]
    assert draft1["provenance_chunk_id"] == "chk_doc_001_000"
    assert draft1["source_page"] == 12
    assert draft1["bloom_verification_status"] == "UNVERIFIED"
    assert draft1["status"] == "DRAFT"

    # Verify checkpointer next step is ('lecturer_review_gate',)
    snapshot = graph.get_state(config)
    assert snapshot.next == ("lecturer_review_gate",)

    # Simulate lecturer approval input
    resume_update = {
        "review_decision": {
            "reviewer_id": "usr-prof-sharma",
            "decision": "APPROVED",
        }
    }
    graph.update_state(config, resume_update)

    # Resume graph execution
    final_state = graph.invoke(None, config=config)
    assert final_state["status"] == "REVIEWED"
    actions = [evt["action"] for evt in final_state["audit_events"]]
    assert "LECTURER_REVIEW_APPLIED" in actions


def test_question_drafting_student_role_unauthorized():
    """Verifies that STUDENT role is strictly barred from drafting questions."""
    graph = create_question_drafting_graph()

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-student-007",
        "actor_role": "STUDENT",  # Unauthorized role
        "course_offering_id": "co-cs101",
        "syllabus_version_id": "syl-01",
        "topic_ids": ["topic-1"],
        "question_count": 1,
        "question_type": "MCQ",
    }

    result = graph.invoke(initial_state)
    assert result["status"] == "FAILED"
    assert "UNAUTHORIZED_ACTOR" in result["error_message"]


def test_question_drafting_zero_scoped_chunks_fails_closed():
    """Verifies fail-closed behavior when no approved chunks match the scope."""
    graph = create_question_drafting_graph()

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-prof-01",
        "actor_role": "LECTURER",
        "course_offering_id": "co-cs101",
        "syllabus_version_id": "syl-01",
        "topic_ids": ["topic-uncovered"],
        "question_count": 1,
        "question_type": "MCQ",
        "scoped_chunks": [],  # Zero matching chunks
    }

    result = graph.invoke(initial_state)
    assert result["status"] == "FAILED"
    assert "NO_USABLE_SOURCES" in result["error_message"]


def test_question_drafting_rejects_unverified_provenance():
    """Verifies that candidates citing chunks outside the authorized scope are rejected."""
    # Custom question worker returning one valid and one hallucinated chunk reference
    class MockWorkerWithHallucination:
        def generate_questions(self, **kwargs):
            return {
                "is_synthetic": True,
                "items": [
                    {
                        "stem": "Valid grounded question?",
                        "options": [
                            {"key": "A", "text": "Correct", "is_correct": True},
                            {"key": "B", "text": "Distractor", "is_correct": False},
                        ],
                        "marks": 2.0,
                        "difficulty": "EASY",
                        "proposed_bloom_level": "REMEMBER",
                        "provenance_chunk_id": "chk_valid_01",
                    },
                    {
                        "stem": "Hallucinated citation question?",
                        "options": [
                            {"key": "A", "text": "Correct", "is_correct": True},
                            {"key": "B", "text": "Distractor", "is_correct": False},
                        ],
                        "marks": 2.0,
                        "difficulty": "EASY",
                        "proposed_bloom_level": "REMEMBER",
                        "provenance_chunk_id": "chk_hallucinated_999",  # Not in scope!
                    },
                ],
            }

    graph = create_question_drafting_graph(question_worker_client=MockWorkerWithHallucination())

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-prof-01",
        "actor_role": "LECTURER",
        "course_offering_id": "co-cs101",
        "syllabus_version_id": "syl-01",
        "topic_ids": ["topic-1"],
        "question_count": 2,
        "question_type": "MCQ",
        "scoped_chunks": [
            {
                "chunk_id": "chk_valid_01",
                "tenant_id": "tenant-kle-tech",
                "course_offering_id": "co-cs101",
                "syllabus_version_id": "syl-01",
                "document_id": "doc_01",
                "page_start": 5,
                "heading_context": "Section 1",
            }
        ],
    }

    result = graph.invoke(initial_state)
    assert len(result["validated_drafts"]) == 1
    assert result["validated_drafts"][0]["provenance_chunk_id"] == "chk_valid_01"
    assert len(result["rejected_candidates"]) == 1
    assert "UNVERIFIED_PROVENANCE" in result["rejected_candidates"][0]["reason"]


def is_postgres_available() -> bool:
    """Helper to check whether PostgreSQL on 54322 is reachable."""
    try:
        import psycopg
        with psycopg.connect("postgresql://127.0.0.1:54322/postgres", connect_timeout=1) as conn:
            return True
    except Exception:
        return False


def test_question_drafting_planner_and_execution_trace():
    """Verifies that the planner decomposes the goal and trace records node steps."""
    checkpointer = MemorySaver()
    graph = create_question_drafting_graph(checkpointer=checkpointer)

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-prof-sharma",
        "actor_role": "LECTURER",
        "course_offering_id": "co-cs101-2026-even",
        "syllabus_version_id": "syl-v1-cs101",
        "topic_ids": ["topic-1", "topic-2"],
        "co_ids": ["co-1"],
        "tlo_ids": ["tlo-1.1"],
        "question_count": 2,
        "question_type": "MCQ",
        "marks_per_question": 2.0,
        "target_bloom_level": "APPLY",
        "difficulty": "MEDIUM",
        "time_budget_ms": 10000,
        "scoped_chunks": [
            {
                "chunk_id": "chk_001",
                "tenant_id": "tenant-kle-tech",
                "course_offering_id": "co-cs101-2026-even",
                "syllabus_version_id": "syl-v1-cs101",
                "document_id": "doc_001",
                "page_start": 1,
                "heading_context": "Unit 1",
            }
        ],
    }

    config = {"configurable": {"thread_id": "trace-test-01"}}
    paused_state = graph.invoke(initial_state, config=config)

    # Verify plan object
    assert "plan" in paused_state
    assert paused_state["plan"]["total_questions"] == 2
    assert paused_state["plan"]["target_bloom"] == "APPLY"
    assert "topic-1" in paused_state["plan"]["topic_allocation"]

    # Verify execution trace contains goal_intake and planner nodes
    trace_nodes = [t["node"] for t in paused_state["execution_trace"]]
    assert "goal_intake" in trace_nodes
    assert "planner" in trace_nodes


def test_question_drafting_time_budget_exceeded():
    """Verifies that when time budget is breached, workflow fails closed."""
    graph = create_question_drafting_graph()

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-prof-sharma",
        "actor_role": "LECTURER",
        "course_offering_id": "co-cs101-2026-even",
        "syllabus_version_id": "syl-v1-cs101",
        "topic_ids": ["topic-1"],
        "question_count": 1,
        "question_type": "MCQ",
        "time_budget_ms": 1,  # 1ms budget!
        "start_time_epoch": time.time() - 5.0,  # Elapsed 5 seconds ago!
        "scoped_chunks": [
            {
                "chunk_id": "chk_001",
                "tenant_id": "tenant-kle-tech",
                "course_offering_id": "co-cs101-2026-even",
                "syllabus_version_id": "syl-v1-cs101",
                "document_id": "doc_001",
                "page_start": 1,
                "heading_context": "Unit 1",
            }
        ],
    }

    result = graph.invoke(initial_state)
    assert result["status"] == "FAILED"
    assert "TIME_BUDGET_EXCEEDED" in result["error_message"]


def test_question_drafting_revision_requested_flow():
    """Verifies that lecturer review can request revision with actionable notes."""
    checkpointer = MemorySaver()
    graph = create_question_drafting_graph(checkpointer=checkpointer)

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-prof-sharma",
        "actor_role": "LECTURER",
        "course_offering_id": "co-cs101",
        "syllabus_version_id": "syl-01",
        "topic_ids": ["topic-1"],
        "question_count": 1,
        "question_type": "MCQ",
        "scoped_chunks": [
            {
                "chunk_id": "chk_001",
                "tenant_id": "tenant-kle-tech",
                "course_offering_id": "co-cs101",
                "syllabus_version_id": "syl-01",
                "document_id": "doc_01",
                "page_start": 1,
                "heading_context": "Section 1",
            }
        ],
    }

    config = {"configurable": {"thread_id": "revision-thread-01"}}
    graph.invoke(initial_state, config=config)

    # Resume with revision requested
    graph.update_state(config, {
        "review_decision": {
            "reviewer_id": "usr-prof-sharma",
            "decision": "REVISION_REQUESTED",
            "notes": "Add numerical scenario questions",
        }
    })

    final_state = graph.invoke(None, config=config)
    assert final_state["status"] == "REVISION_REQUESTED"
    assert final_state["persisted_to_db"] is True


def test_question_drafting_postgres_saver_restart_recovery():
    """
    Production Pilot Gate B:
    Verifies that PostgresSaver persists checkpoints in PostgreSQL across process restarts.
    """
    if not is_postgres_available():
        pytest.skip("PostgreSQL (port 54322) is not reachable in this execution sandbox")

    import uuid
    from langgraph.checkpoint.postgres import PostgresSaver

    conn_str = "postgresql://127.0.0.1:54322/postgres"
    thread_id = f"test-pg-restart-{uuid.uuid4().hex[:8]}"

    # Phase 1: Run graph on Instance 1
    with PostgresSaver.from_conn_string(conn_str) as checkpointer1:
        checkpointer1.setup()
        graph1 = create_question_drafting_graph(checkpointer=checkpointer1)

        initial_state = {
            "tenant_id": "00000000-0000-0000-0000-000000000001",
            "actor_id": "11111111-1111-1111-1111-111111111111",
            "actor_role": "LECTURER",
            "course_offering_id": "co-26ecac401-2026",
            "syllabus_version_id": "syl-26ecac401-v1",
            "topic_ids": ["topic-agent-frameworks"],
            "question_count": 1,
            "question_type": "MCQ",
            "marks_per_question": 2.0,
            "scoped_chunks": [
                {
                    "chunk_id": "chk_pg_001",
                    "tenant_id": "00000000-0000-0000-0000-000000000001",
                    "course_offering_id": "co-26ecac401-2026",
                    "syllabus_version_id": "syl-26ecac401-v1",
                    "document_id": "doc_pg_001",
                    "page_start": 4,
                    "heading_context": "LangGraph StateGraph Execution",
                }
            ],
        }

        config = {"configurable": {"thread_id": thread_id}}
        paused_state = graph1.invoke(initial_state, config=config)
        assert paused_state["status"] == "DRAFT_READY_FOR_REVIEW"
        assert len(paused_state["validated_drafts"]) == 1

    # Simulate complete process crash / new process instantiation
    # Phase 2: Open completely new checkpointer & graph instance
    with PostgresSaver.from_conn_string(conn_str) as checkpointer2:
        graph2 = create_question_drafting_graph(checkpointer=checkpointer2)
        config = {"configurable": {"thread_id": thread_id}}

        # Inspect durable checkpoint from PostgreSQL
        snapshot = graph2.get_state(config)
        assert snapshot.next == ("lecturer_review_gate",)
        assert snapshot.values["status"] == "DRAFT_READY_FOR_REVIEW"
        assert len(snapshot.values["validated_drafts"]) == 1
        assert snapshot.values["consensus_score"] >= 70.0

        # Resume execution on Instance 2
        graph2.update_state(config, {
            "review_decision": {
                "reviewer_id": "usr-prof-sharma",
                "decision": "APPROVED",
            }
        })
        final_state = graph2.invoke(None, config=config)
        assert final_state["status"] == "REVIEWED"
        assert final_state["persisted_to_db"] is True
        assert len(final_state["decoupled_answer_keys"]) == 1

        # Phase 3: Idempotency check (re-resume does not duplicate or alter state)
        idempotent_state = graph2.invoke(None, config=config)
        assert idempotent_state["status"] == "REVIEWED"


def test_question_drafting_graph_with_model_adapter():
    """Phase 13D: Verifies LangGraph execution with ModelProviderAdapter and tool logging."""
    from src.model_adapter import ModelProviderAdapter

    checkpointer = MemorySaver()
    # Initialize adapter with fast timeout for deterministic test
    adapter = ModelProviderAdapter(timeout_seconds=2.0, max_retries=0)
    graph = create_question_drafting_graph(checkpointer=checkpointer, model_adapter=adapter)

    initial_state = {
        "tenant_id": "tenant-kle-tech",
        "actor_id": "usr-lecturer-001",
        "actor_role": "LECTURER",
        "course_offering_id": "course-26ecac401",
        "syllabus_version_id": "syl-v1-2026",
        "topic_ids": ["T1.1"],
        "co_ids": ["CO1"],
        "tlo_ids": ["TLO1.1"],
        "question_count": 1,
        "question_type": "MCQ",
        "marks_per_question": 2.0,
        "target_bloom_level": "UNDERSTAND",
        "difficulty": "MEDIUM",
        "goal": "Draft 1 question on Agent Lifecycle grounded in syllabus",
        "scoped_chunks": [
            {
                "chunk_id": "chunk-test-101",
                "tenant_id": "tenant-kle-tech",
                "course_offering_id": "course-26ecac401",
                "document_id": "doc-syllabus-001",
                "page_start": 3,
                "heading_context": "Agent Lifecycle & Tools",
                "content": "Agents execute iterative loops: Plan, Act, Observe, and Improve.",
            }
        ],
    }

    config = {"configurable": {"thread_id": "thread-model-adapter-001"}}
    paused_state = graph.invoke(initial_state, config=config)

    assert paused_state["status"] == "DRAFT_READY_FOR_REVIEW"
    assert len(paused_state["validated_drafts"]) == 1
    draft = paused_state["validated_drafts"][0]
    assert draft["provenance_chunk_id"] == "chunk-test-101"
    assert draft["provenance_type"] in ("REAL_MODEL", "DETERMINISTIC_RULE", "TEST_FIXTURE")

    # Verify tool call logged
    assert len(paused_state["tool_calls"]) >= 1
    assert paused_state["tool_calls"][0]["tool_name"] == "search_course_material"
    assert paused_state["tool_calls"][0]["protocol"] == "MCP"

    # Verify execution trace
    nodes_in_trace = [t["node"] for t in paused_state["execution_trace"]]
    assert "planner" in nodes_in_trace
    assert "researcher" in nodes_in_trace
    assert "builder" in nodes_in_trace


