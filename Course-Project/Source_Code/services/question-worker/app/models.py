from typing import List, Optional
from pydantic import BaseModel, Field

class ChunkInput(BaseModel):
    chunk_id: str
    title: str
    text: str
    page_number: Optional[int] = None
    section: Optional[str] = None

class QuestionGenerationRequest(BaseModel):
    tenant_id: str
    course_offering_id: str
    syllabus_version_id: str
    chunks: List[ChunkInput] = Field(min_length=1, max_length=100)
    num_questions: int = Field(default=5, ge=1, le=50)
    target_bloom_levels: Optional[List[str]] = Field(default_factory=lambda: ["UNDERSTAND", "APPLY"])
    target_co_id: Optional[str] = None
    target_topic_ids: Optional[List[str]] = Field(default_factory=list)

class QuestionDraft(BaseModel):
    id: str
    question_text: str
    question_type: str = "single_choice"
    options: Optional[List[str]] = Field(default_factory=list)
    suggested_answer: str
    marks: float = 1.0
    difficulty: str = "medium"
    bloom_level: str = "UNDERSTAND"
    bloom_verification_status: str = "UNVERIFIED_BY_LECTURER"
    source_locator: str
    source_excerpt: str = ""
    provenance_chunk_id: Optional[str] = None
    status: str = "DRAFT"
    is_synthetic: bool = False
    co_id: Optional[str] = None
    topic_id: Optional[str] = None
    validation_warnings: List[str] = Field(default_factory=list)

class QuestionGenerationResponse(BaseModel):
    tenant_id: str
    course_offering_id: str
    syllabus_version_id: str
    questions: List[QuestionDraft]
    errors: List[str] = Field(default_factory=list)
    provider_info: str = "unspecified"
