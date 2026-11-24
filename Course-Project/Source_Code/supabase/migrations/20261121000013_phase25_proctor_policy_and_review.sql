-- ==============================================================================
-- AURA PHASE 25: PROCTORING POLICY, INTEGRITY REVIEW AGENT & 200-CLIENT OUTBOX
-- Institution: KLE Technological University, Hubballi
-- Course Pilot: 26ECAC401 — Agentic AI
-- ==============================================================================

-- 1. Proctoring Policy Configuration Table
CREATE TABLE IF NOT EXISTS public.exam_proctoring_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    exam_schedule_id UUID REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
    policy_name VARCHAR(128) NOT NULL,
    policy_version VARCHAR(32) NOT NULL DEFAULT 'v25.0',
    gaze_deviation_dwell_sec NUMERIC(4,1) NOT NULL DEFAULT 5.0,
    face_outside_dwell_sec NUMERIC(4,1) NOT NULL DEFAULT 5.0,
    face_absent_warn_sec NUMERIC(4,1) NOT NULL DEFAULT 5.0,
    face_absent_pause_sec NUMERIC(4,1) NOT NULL DEFAULT 15.0,
    multiple_faces_dwell_sec NUMERIC(4,1) NOT NULL DEFAULT 2.5,
    multiple_faces_pause_sec NUMERIC(4,1) NOT NULL DEFAULT 5.0,
    phone_detection_dwell_sec NUMERIC(4,1) NOT NULL DEFAULT 2.0,
    camera_freeze_dwell_sec NUMERIC(4,1) NOT NULL DEFAULT 3.0,
    hysteresis_cooldown_sec NUMERIC(4,1) NOT NULL DEFAULT 2.0,
    auto_pause_enabled BOOLEAN NOT NULL DEFAULT true,
    auto_terminate_enabled BOOLEAN NOT NULL DEFAULT false, -- Strict non-LLM authority: Only human can terminate
    config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proctor_policies_tenant ON public.exam_proctoring_policies(tenant_id);
CREATE INDEX IF NOT EXISTS idx_proctor_policies_schedule ON public.exam_proctoring_policies(exam_schedule_id);

-- 2. Human Invigilator / COE Incident Review & Verdict Table
CREATE TABLE IF NOT EXISTS public.exam_incident_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    incident_id UUID REFERENCES public.exam_proctoring_incidents(id) ON DELETE SET NULL,
    reviewer_id UUID NOT NULL REFERENCES public.users(id),
    reviewer_role VARCHAR(32) NOT NULL, -- 'COE_ADMIN' | 'INVIGILATOR'
    verdict VARCHAR(32) NOT NULL CHECK (verdict IN ('CONFIRMED', 'FALSE_POSITIVE', 'INCONCLUSIVE', 'DISMISSED')),
    notes TEXT NOT NULL,
    action_taken VARCHAR(64) NOT NULL DEFAULT 'LOGGED' CHECK (action_taken IN ('LOGGED', 'WARNING_ISSUED', 'EXAM_PAUSED', 'EXAM_RESUMED', 'EXAM_TERMINATED')),
    reviewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_incident_reviews_attempt ON public.exam_incident_reviews(tenant_id, attempt_id);
CREATE INDEX IF NOT EXISTS idx_incident_reviews_incident ON public.exam_incident_reviews(incident_id);

-- 3. AURA Exam Integrity Review Agent Evidence-Linked Summary Table
CREATE TABLE IF NOT EXISTS public.integrity_review_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    exam_schedule_id UUID NOT NULL REFERENCES public.exam_schedules(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    risk_level VARCHAR(32) NOT NULL DEFAULT 'LOW' CHECK (risk_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'NEEDS_REVIEW')),
    confidence_score NUMERIC(5,2) NOT NULL DEFAULT 0.95,
    total_incidents INTEGER NOT NULL DEFAULT 0,
    incident_breakdown JSONB NOT NULL DEFAULT '{}'::jsonb,
    timeline_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    agent_summary_text TEXT NOT NULL,
    cited_incident_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    recommendations TEXT NOT NULL DEFAULT 'NO_ACTION',
    data_quality_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    generated_by_agent VARCHAR(64) NOT NULL DEFAULT 'AURA Exam Integrity Review Agent v25.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_attempt_review_summary UNIQUE (attempt_id)
);

CREATE INDEX IF NOT EXISTS idx_integrity_summaries_tenant_attempt ON public.integrity_review_summaries(tenant_id, attempt_id);
CREATE INDEX IF NOT EXISTS idx_integrity_summaries_schedule ON public.integrity_review_summaries(exam_schedule_id);

-- 4. Durable Telemetry Outbox Queue Table (200-Client Concurrency)
CREATE TABLE IF NOT EXISTS public.telemetry_outbox (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES public.exam_attempts(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.exam_proctoring_sessions(id) ON DELETE CASCADE,
    sequence_number BIGINT NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PROCESSED', 'FAILED')),
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_telemetry_outbox_key UNIQUE (tenant_id, attempt_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_telemetry_outbox_status ON public.telemetry_outbox(tenant_id, status, created_at ASC);

-- 5. Seed Institutional Default Proctoring Policy for 26ECAC401 Pilot
INSERT INTO public.exam_proctoring_policies (
    tenant_id,
    exam_schedule_id,
    policy_name,
    policy_version,
    gaze_deviation_dwell_sec,
    face_outside_dwell_sec,
    face_absent_warn_sec,
    face_absent_pause_sec,
    multiple_faces_dwell_sec,
    multiple_faces_pause_sec,
    phone_detection_dwell_sec,
    camera_freeze_dwell_sec,
    hysteresis_cooldown_sec,
    auto_pause_enabled,
    auto_terminate_enabled,
    config_json
)
SELECT 
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
    '26ECAC401 Institutional Proctoring Policy',
    'v25.0',
    5.0, 5.0, 5.0, 15.0, 2.5, 5.0, 2.0, 3.0, 2.0, true, false,
    jsonb_build_object(
        'course_code', '26ECAC401',
        'institution', 'KLE Technological University',
        'desk_equipment_allowlist', jsonb_build_array('primary_laptop', 'usb_mouse', 'integrated_keyboard'),
        'lighting_anomaly_policy', 'SUPPORTING_TELEMETRY_ONLY'
    )
WHERE NOT EXISTS (
    SELECT 1 FROM public.exam_proctoring_policies 
    WHERE exam_schedule_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid
);
