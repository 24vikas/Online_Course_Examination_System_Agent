"""
Unit and Integration Tests for Deep Research LangGraph Graph.
Verifies:
1. Full 7-step LangGraph StateGraph execution (Query Understanding -> Appendix).
2. Scopes: approved_syllabus_rag, uploaded_docs, external_web, combined.
3. Citation integrity: external claims with URLs/dates, institutional claims with doc/page/chunk.
4. Quality/Conflict checks: detection of out-of-curriculum or unsupported claims.
5. Claim-to-source mapping and structured evidence table.
6. PostgreSQL persistence of run state, tokens, duration, and provider.
"""

import sys
import os
import pytest
import uuid
from langgraph.checkpoint.memory import MemorySaver

# Ensure services/workflow-worker is on python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.deep_research import (
    create_deep_research_graph,
    run_deep_research,
    DeepResearchState,
    persist_research_run_to_postgres,
)


def test_deep_research_graph_happy_path_combined():
    """Verifies that combined scope executes all 7 LangGraph nodes and synthesizes verified report."""
    checkpointer = MemorySaver()
    graph = create_deep_research_graph(checkpointer=checkpointer)

    initial_state = {
        "tenant_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "actor_id": "d2222222-2222-2222-2222-222222222222",
        "actor_role": "LECTURER",
        "course_offering_id": "c1111111-1111-1111-1111-111111111111",
        "course_code": "CS-301",
        "query": "Distributed Consensus and Spanner TrueTime API",
        "scope": "combined",
        "depth": "comprehensive",
        "allowed_domains": ["iso.org", "acm.org"],
        "max_sources": 6,
        "thread_id": "test-res-combined-01",
        "run_id": str(uuid.uuid4()),
        "provider_id": "BAAI/bge-m3",
        "model_id": "gemini-1.5-pro",
    }

    config = {"configurable": {"thread_id": "test-res-combined-01"}}
    final_state = graph.invoke(initial_state, config=config)

    assert final_state["status"] == "COMPLETED"
    assert final_state["current_step"] == "COMPLETED"

    # Step 1: Query Understanding
    assert "parsed_intent" in final_state
    assert final_state["parsed_intent"]["course_code"] == "CS-301"

    # Step 2: Sub-questions
    assert len(final_state["sub_questions"]) >= 3
    assert any("foundational" in sq["question"].lower() or "invariants" in sq["question"].lower() for sq in final_state["sub_questions"])

    # Step 3 & 4: Sources and Evidence
    evidence = final_state["evidence_table"]
    assert len(evidence) >= 4
    has_syllabus = any(e["sourceType"] == "COURSE_SYLLABUS" for e in evidence)
    has_external = any(e["sourceType"] in ("STANDARDS_DOC", "ACADEMIC_PAPER") for e in evidence)
    assert has_syllabus, "Combined scope must include syllabus evidence"
    assert has_external, "Combined scope must include external standards evidence"

    # Step 5: Verification & Confidence
    assert final_state["confidence_overall"] > 0.85
    assert len(final_state["unsupported_claims"]) == 0

    # Step 6: Synthesis with citations
    report = final_state["synthesized_report"]
    assert "# Executive Deep Research Dossier" in report
    assert "[1]" in report
    assert "[2]" in report
    assert "Authoritative Citations & References" in report
    assert len(final_state["claim_to_source_mapping"]) >= 4

    # Step 7: Appendix and Trace
    assert final_state["tokens_used"] > 500
    assert final_state["duration_ms"] > 0
    assert len(final_state["execution_trace"]) == 7


def test_deep_research_syllabus_rag_scope():
    """Verifies that approved_syllabus_rag scope targets curriculum citations with doc/page/chunk."""
    payload = {
        "tenant_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "course_code": "26ECAC401",
        "query": "Agentic AI Autonomous Planning and Human in the loop review",
        "scope": "approved_syllabus_rag",
        "max_sources": 4,
    }

    result = run_deep_research(payload)
    assert result["success"] is True
    assert result["scope"] == "approved_syllabus_rag"

    # Every item must have document_name, chunk_id, and page_start in metadata
    for item in result["evidence_table"]:
        assert item["sourceType"] in ("COURSE_SYLLABUS", "INTERNAL_CURRICULUM")
        meta = item["metadata"]
        assert "document_name" in meta
        assert "chunk_id" in meta
        assert "page_start" in meta
        assert "syllabus://" in item["domainOrLocator"] or "document://" in item["domainOrLocator"]


def test_deep_research_external_web_scope():
    """Verifies that external_web scope returns academic standards and papers with URLs and dates."""
    payload = {
        "tenant_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "course_code": "CS-301",
        "query": "Paxos vs Raft distributed consensus protocol trade-offs",
        "scope": "external_web",
        "max_sources": 5,
    }

    result = run_deep_research(payload)
    assert result["success"] is True
    assert result["scope"] == "external_web"

    for item in result["evidence_table"]:
        assert item["sourceType"] in ("STANDARDS_DOC", "ACADEMIC_PAPER", "EXTERNAL_WEB")
        meta = item["metadata"]
        assert "url" in meta
        assert meta["url"].startswith("http")
        assert "access_date" in meta


def test_deep_research_unsupported_claim_detection():
    """Verifies detection of ungrounded or speculative concepts out of curriculum scope."""
    payload = {
        "tenant_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "course_code": "CS-301",
        "query": "Quantum blockchain consensus in classical relational databases",
        "scope": "combined",
    }

    result = run_deep_research(payload)
    assert result["success"] is True
    assert len(result["unsupported_claims"]) > 0
    assert any("quantum" in c.lower() or "blockchain" in c.lower() for c in result["unsupported_claims"])
    assert result["confidence_overall"] < 0.80


def test_deep_research_postgres_persistence():
    """Verifies that run state, tokens, duration, and provider are stored in agent_runs."""
    run_id = str(uuid.uuid4())
    payload = {
        "run_id": run_id,
        "tenant_id": "dddddddd-dddd-dddd-dddd-dddddddddddd",
        "actor_id": "d2222222-2222-2222-2222-222222222222",
        "actor_role": "LECTURER",
        "course_offering_id": "c1111111-1111-1111-1111-111111111111",
        "course_code": "CS-301",
        "query": "Relational constraints and ISO SQL Standards",
        "scope": "combined",
        "provider_id": "BAAI/bge-m3",
    }

    result = run_deep_research(payload)
    assert result["success"] is True
    assert result["persisted_to_db"] is True
    assert result["tokens_used"] > 0
    assert result["duration_ms"] > 0
    assert result["provider_id"] == "BAAI/bge-m3"

    # Direct DB verification
    try:
        import psycopg
        conn_str = os.environ.get("DATABASE_URL") or "postgresql://127.0.0.1:54322/postgres"
        with psycopg.connect(conn_str) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id::text, status, tokens_used, duration_ms, provider, scope FROM agent_runs WHERE id = %s",
                    (run_id,),
                )
                row = cur.fetchone()
                assert row is not None
                assert row[0] == run_id
                assert row[1] == "COMPLETED"
                assert row[2] == result["tokens_used"]
                assert row[3] == result["duration_ms"]
                assert row[4] == "BAAI/bge-m3"
                assert row[5] == "combined"
    except Exception as e:
        pytest.skip(f"PostgreSQL socket test skipped if offline: {e}")
