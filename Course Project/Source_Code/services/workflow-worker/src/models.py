"""
Workflow Worker Models
State schemas and data structures for LangGraph workflows.
"""

from typing import List, Dict, Any, Optional
from typing_extensions import TypedDict
from pydantic import BaseModel, Field


class DocumentIngestionState(TypedDict, total=False):
    """State schema for Document Ingestion LangGraph workflow."""
    tenant_id: str
    user_id: str
    course_offering_id: str
    syllabus_version_id: str
    document_id: str
    storage_path: str
    mime_type: str
    file_size_bytes: int
    sha256_checksum: str
    raw_content: Optional[bytes]
    extracted_markdown: Optional[str]
    extracted_tables: List[Dict[str, Any]]
    chunks: List[Dict[str, Any]]
    embeddings_generated: bool
    status: str  # PENDING, PROCESSING, EXTRACTED, CHUNKED, READY, FAILED
    error_message: Optional[str]
    audit_events: List[Dict[str, Any]]


class QuestionDraftingState(TypedDict, total=False):
    """State schema for Question Drafting LangGraph workflow."""
    tenant_id: str
    actor_id: str
    actor_role: str  # LECTURER, COE_ADMIN
    course_offering_id: str
    syllabus_version_id: str
    topic_ids: List[str]
    co_ids: List[str]
    tlo_ids: List[str]
    allowed_document_ids: List[str]
    question_count: int
    question_type: str  # MCQ, SHORT_ANSWER, NUMERICAL, ESSAY
    marks_per_question: float
    target_bloom_level: str
    difficulty: str  # EASY, MEDIUM, HARD
    time_budget_ms: int
    start_time_epoch: float
    goal: Optional[str]
    plan: Optional[Dict[str, Any]]
    execution_trace: List[Dict[str, Any]]
    tool_calls: List[Dict[str, Any]]
    scoped_chunks: List[Dict[str, Any]]
    raw_candidates: List[Dict[str, Any]]
    validated_drafts: List[Dict[str, Any]]
    rejected_candidates: List[Dict[str, Any]]
    coverage_finding: Optional[Dict[str, Any]]
    quality_finding: Optional[Dict[str, Any]]
    provenance_finding: Optional[Dict[str, Any]]
    swarm_findings: List[Dict[str, Any]]
    consensus_score: float
    revision_count: int
    model_metadata: Optional[Dict[str, Any]]
    is_synthetic: bool
    status: str  # INIT, PLANNED, SCOPED_RETRIEVED, DRAFT_READY_FOR_REVIEW, REVIEWED, COMPLETED, REVISION_REQUESTED, REJECTED, FAILED
    error_message: Optional[str]
    audit_events: List[Dict[str, Any]]
    review_decision: Optional[Dict[str, Any]]
    decoupled_answer_keys: List[Dict[str, Any]]
    persisted_to_db: bool


class DeepResearchState(TypedDict, total=False):
    """State schema for Deep Research LangGraph multi-step graph."""
    tenant_id: str
    actor_id: str
    actor_role: str
    course_offering_id: Optional[str]
    course_code: Optional[str]
    query: str
    scope: str  # approved_syllabus_rag, uploaded_docs, external_web, combined
    depth: str  # comprehensive, rigorous, exam_cram, standard
    allowed_domains: List[str]
    max_sources: int
    thread_id: str
    provider_id: str
    model_id: str
    status: str  # INIT, PLANNING, SEARCHING, FETCHING, VERIFYING, SYNTHESIZING, COMPLETED, FAILED
    current_step: str
    start_time_epoch: float
    end_time_epoch: float
    duration_ms: int
    tokens_used: int
    prompt_tokens: int
    completion_tokens: int
    execution_trace: List[Dict[str, Any]]
    parsed_intent: Dict[str, Any]
    sub_questions: List[Dict[str, Any]]
    raw_sources: List[Dict[str, Any]]
    extracted_evidence: List[Dict[str, Any]]
    verified_evidence: List[Dict[str, Any]]
    contradictions_or_conflicts: List[Dict[str, Any]]
    unsupported_claims: List[str]
    confidence_overall: float
    synthesized_report: str
    claim_to_source_mapping: List[Dict[str, Any]]
    evidence_table: List[Dict[str, Any]]
    citations: List[Dict[str, Any]]
    persisted_to_db: bool
    run_id: str
    error_message: Optional[str]
