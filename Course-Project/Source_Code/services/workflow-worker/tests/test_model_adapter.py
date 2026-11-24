"""
Unit tests for ModelProviderAdapter (Phase 13C)
Tests configuration, error handling, circuit breaking, JSON extraction, and provenance typing.
"""

import pytest
import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from src.model_adapter import (
    ModelProviderAdapter,
    GenerationResult,
    PROVENANCE_REAL_MODEL,
    PROVENANCE_DETERMINISTIC_RULE,
    PROVENANCE_TEST_FIXTURE,
)


def test_model_adapter_initialization_defaults():
    adapter = ModelProviderAdapter()
    assert adapter.provider_id in ("ollama", "openai_compatible")
    assert adapter.model_id == "llama3.2:3b"
    assert adapter.timeout_seconds == 15.0
    assert adapter.max_retries == 1


def test_json_block_extraction():
    adapter = ModelProviderAdapter()

    # Markdown fenced json
    fenced = '```json\n{"total_questions": 2, "target_bloom": "APPLY"}\n```'
    data = adapter._extract_json_block(fenced)
    assert data == {"total_questions": 2, "target_bloom": "APPLY"}

    # Raw json
    raw = '{"status": "OK", "count": 5}'
    assert adapter._extract_json_block(raw) == {"status": "OK", "count": 5}

    # JSON array
    arr = '[{"key": "A"}, {"key": "B"}]'
    assert adapter._extract_json_block(arr) == [{"key": "A"}, {"key": "B"}]

    # Malformed text returns None
    assert adapter._extract_json_block("Not json at all") is None


def test_circuit_breaker_on_repeated_failures():
    # Point adapter to non-existent endpoint
    adapter = ModelProviderAdapter(
        base_url="http://127.0.0.1:59999/v1",
        timeout_seconds=0.5,
        max_retries=0,
    )

    # 3 failures should trigger circuit breaker
    res1 = adapter.generate_chat_completion([{"role": "user", "content": "hi"}])
    assert res1.error is not None
    assert adapter._consecutive_failures == 1

    res2 = adapter.generate_chat_completion([{"role": "user", "content": "hi"}])
    assert adapter._consecutive_failures == 2

    res3 = adapter.generate_chat_completion([{"role": "user", "content": "hi"}])
    assert adapter._consecutive_failures == 3
    assert adapter._circuit_open_until > time.time()

    # 4th call should immediately return CIRCUIT_OPEN without waiting
    t0 = time.time()
    res4 = adapter.generate_chat_completion([{"role": "user", "content": "hi"}])
    elapsed = time.time() - t0
    assert "CIRCUIT_OPEN" in res4.error
    assert elapsed < 0.1  # Fast rejection


def test_plan_workflow_deterministic_fallback():
    adapter = ModelProviderAdapter(
        base_url="http://127.0.0.1:59999/v1",
        timeout_seconds=0.5,
        max_retries=0,
    )

    res = adapter.plan_workflow(
        goal="Test goal",
        topic_ids=["T1.1", "T1.2"],
        question_count=4,
        target_bloom="APPLY",
        difficulty="MEDIUM",
    )

    assert res.structured_data is not None
    assert res.structured_data["total_questions"] == 4
    assert res.structured_data["target_bloom"] == "APPLY"
    assert "T1.1" in res.structured_data["topic_allocation"]


def test_generate_question_candidates_with_chunks():
    adapter = ModelProviderAdapter(
        base_url="http://127.0.0.1:59999/v1",
        timeout_seconds=0.5,
        max_retries=0,
    )

    chunks = [
        {
            "chunk_id": "chunk-test-001",
            "heading_context": "Agent Loops",
            "page_start": 4,
            "content": "An autonomous worklet operates in an iterative Plan-Act-Observe-Improve cycle.",
        }
    ]

    candidates, res = adapter.generate_question_candidates(
        scoped_chunks=chunks,
        question_count=1,
        primary_topic="Agent Lifecycle",
        target_bloom="UNDERSTAND",
        difficulty="MEDIUM",
    )

    assert len(candidates) == 1
    assert candidates[0]["provenance_chunk_id"] == "chunk-test-001"
    assert len(candidates[0]["options"]) == 4
    correct = [o for o in candidates[0]["options"] if o["is_correct"]]
    assert len(correct) == 1


def test_live_ollama_inference_when_available():
    """If local Ollama endpoint is reachable, verifies real model completion & token metrics."""
    adapter = ModelProviderAdapter(
        base_url="http://127.0.0.1:11434/v1",
        model_id="llama3.2:3b",
        timeout_seconds=10.0,
        max_retries=1,
    )
    health = adapter.check_health()
    if not health.get("healthy"):
        pytest.skip("Local Ollama not reachable; skipping live inference test")

    res = adapter.generate_chat_completion(
        messages=[{"role": "user", "content": "Respond with the single word: VERIFIED"}],
        max_tokens=10,
    )

    assert res.provenance_type == PROVENANCE_REAL_MODEL
    assert "VERIFIED" in res.content.upper()
    assert res.total_tokens > 0
    assert res.latency_ms > 0
    assert res.error is None
