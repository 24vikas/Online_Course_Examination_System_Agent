import os
import pytest
from fastapi.testclient import TestClient

# Explicitly mark as test environment
os.environ["APP_ENV"] = "test"
os.environ["TEST_MODE"] = "true"
os.environ["USE_FAKE_LLM_PROVIDER"] = "true"
os.environ["QUESTION_WORKER_SECRET"] = "test-internal-secret"

import sys
from pathlib import Path
WORKER_DIR = Path(__file__).resolve().parents[1]
if str(WORKER_DIR) not in sys.path:
    sys.path.insert(0, str(WORKER_DIR))

from app.main import app

client = TestClient(app)

def test_health_endpoint():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["version"] == "0.3.0"
    assert data["test_environment"] is True


def test_unauthenticated_request_rejected():
    payload = {
        "tenant_id": "ten-123",
        "course_offering_id": "off-456",
        "syllabus_version_id": "syl-789",
        "chunks": [{"chunk_id": "chk-1", "title": "DDL", "text": "CREATE TABLE basics"}],
        "num_questions": 2,
    }
    response = client.post("/api/v1/generate-questions", json=payload)
    assert response.status_code == 401
    assert "Missing or invalid internal service" in response.json()["detail"]


def test_authenticated_generation_in_test_mode_tags_synthetic():
    payload = {
        "tenant_id": "ten-kle-01",
        "course_offering_id": "off-dbms-2026",
        "syllabus_version_id": "syl-v1-dbms",
        "chunks": [
            {
                "chunk_id": "chk-ddl-01",
                "title": "Unit 1: DDL Foundations",
                "text": "The CREATE TABLE statement defines relation schemas with attributes and data types.",
                "page_number": 12,
            },
        ],
        "num_questions": 2,
        "target_bloom_levels": ["UNDERSTAND", "APPLY"],
        "target_co_id": "CO1",
        "target_topic_ids": ["top-ddl-01"],
    }
    headers = {"X-Internal-Service-Key": "test-internal-secret"}
    response = client.post("/api/v1/generate-questions", json=payload, headers=headers)
    assert response.status_code == 200
    data = response.json()

    assert data["tenant_id"] == "ten-kle-01"
    assert len(data["questions"]) >= 1

    for q in data["questions"]:
        assert q["status"] == "DRAFT"
        # Security & Integrity invariants verified:
        assert q["is_synthetic"] is True, "Test provider must explicitly tag questions as synthetic"
        assert q["bloom_verification_status"] == "UNVERIFIED_BY_LECTURER"
        assert q["provenance_chunk_id"] == "chk-ddl-01"
        assert "TEST_ONLY" in q["validation_warnings"][0]


def test_missing_credentials_in_production_mode_fails_closed(monkeypatch):
    # Simulate production mode without real LLM keys
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv("TEST_MODE", "false")
    monkeypatch.setenv("USE_FAKE_LLM_PROVIDER", "false")
    monkeypatch.delenv("GPUSTACK_API_KEY", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setenv("QUESTION_WORKER_SECRET", "prod-configured-secret-key-12345")

    payload = {
        "tenant_id": "ten-prod-01",
        "course_offering_id": "off-prod-01",
        "syllabus_version_id": "syl-prod-01",
        "chunks": [{"chunk_id": "chk-1", "title": "Sec", "text": "Content"}],
        "num_questions": 1,
    }
    headers = {"X-Internal-Service-Key": "prod-configured-secret-key-12345"}
    response = client.post("/api/v1/generate-questions", json=payload, headers=headers)

    # In production without real LLM credentials, must fail closed with 503 (NOT silently generate fake data)
    assert response.status_code == 503
    assert "LLM_PROVIDER_NOT_CONFIGURED" in response.json()["detail"]
