-- Migration: 20261113000009_phase14_ai_providers_and_proctoring.sql
-- Description: AI Provider registry, encrypted secrets at rest, SEB proctoring configs, and incident review

BEGIN;

-- 1. AI PROVIDERS REGISTRY
CREATE TABLE IF NOT EXISTS ai_providers (
    id VARCHAR(64) NOT NULL,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider_type VARCHAR(32) NOT NULL, -- 'ollama', 'gemini', 'groq', 'custom_openai'
    provider_name VARCHAR(128) NOT NULL,
    base_url VARCHAR(512),
    model_id VARCHAR(128) NOT NULL,
    encrypted_api_key TEXT, -- IV:AuthTag:Ciphertext (AES-256-GCM)
    key_suffix VARCHAR(8),  -- Last 4 chars for UI display (e.g., '••••••••abcd')
    is_active BOOLEAN NOT NULL DEFAULT false,
    is_default BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(32) NOT NULL DEFAULT 'NOT_CONFIGURED', -- 'NOT_CONFIGURED', 'CONFIGURED', 'READY', 'CONNECTION_FAILED', 'RATE_LIMITED'
    last_tested_at TIMESTAMPTZ,
    last_error TEXT,
    routing_roles JSONB NOT NULL DEFAULT '["PLANNER", "RESEARCHER", "BUILDER", "REVIEWER"]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, id)
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_tenant_active ON ai_providers (tenant_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ai_providers_tenant_default ON ai_providers (tenant_id, is_default);

-- 2. EXAM PROCTORING CONFIGURATIONS
CREATE TABLE IF NOT EXISTS exam_proctoring_configs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    exam_schedule_id UUID NOT NULL REFERENCES exam_schedules(id) ON DELETE CASCADE,
    seb_required BOOLEAN NOT NULL DEFAULT false,
    seb_config_key_hash VARCHAR(128),
    seb_browser_exam_key_hash VARCHAR(128),
    camera_required BOOLEAN NOT NULL DEFAULT false,
    mic_required BOOLEAN NOT NULL DEFAULT false,
    fullscreen_required BOOLEAN NOT NULL DEFAULT true,
    consent_text TEXT NOT NULL,
    consent_version VARCHAR(32) NOT NULL DEFAULT '1.0.0',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_proctor_config_schedule UNIQUE (tenant_id, exam_schedule_id)
);

-- 3. ATTEMPT PROCTOR CONSENTS & PREFLIGHT AUDIT
CREATE TABLE IF NOT EXISTS attempt_proctor_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attempt_id UUID NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    consent_version VARCHAR(32) NOT NULL,
    preflight_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    seb_verified BOOLEAN NOT NULL DEFAULT false,
    ip_address VARCHAR(64),
    user_agent TEXT,
    consented_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_proctor_consent_attempt UNIQUE (attempt_id)
);

-- 4. EXTEND ATTEMPT INTEGRITY SIGNALS FOR HUMAN REVIEW
ALTER TABLE attempt_integrity_signals
    ADD COLUMN IF NOT EXISTS review_status VARCHAR(32) NOT NULL DEFAULT 'PENDING_REVIEW',
    ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES users(id),
    ADD COLUMN IF NOT EXISTS review_notes TEXT,
    ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_attempt_signals_review ON attempt_integrity_signals (tenant_id, review_status);
CREATE INDEX IF NOT EXISTS idx_attempt_signals_attempt ON attempt_integrity_signals (attempt_id, logged_at);

-- 5. ENABLE ROW LEVEL SECURITY
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_proctoring_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempt_proctor_consents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_providers_tenant_isolation ON ai_providers;
CREATE POLICY ai_providers_tenant_isolation ON ai_providers
    FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS exam_proctoring_configs_tenant_isolation ON exam_proctoring_configs;
CREATE POLICY exam_proctoring_configs_tenant_isolation ON exam_proctoring_configs
    FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

DROP POLICY IF EXISTS attempt_proctor_consents_tenant_isolation ON attempt_proctor_consents;
CREATE POLICY attempt_proctor_consents_tenant_isolation ON attempt_proctor_consents
    FOR ALL USING (tenant_id = NULLIF(current_setting('app.current_tenant_id', true), '')::uuid);

-- 6. SEED CANONICAL DEFAULT PROVIDER FOR KLE TENANT
INSERT INTO ai_providers (
    id, tenant_id, provider_type, provider_name, base_url, model_id,
    encrypted_api_key, key_suffix, is_active, is_default, status, last_tested_at
) VALUES (
    'ollama-local',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'ollama',
    'Local Ollama (Host GTX 1650)',
    'http://127.0.0.1:11434/v1',
    'llama3.2:3b',
    NULL,
    NULL,
    true,
    true,
    'READY',
    NOW()
)
ON CONFLICT (tenant_id, id) DO UPDATE SET
    base_url = EXCLUDED.base_url,
    model_id = EXCLUDED.model_id,
    is_active = true,
    is_default = true,
    status = 'READY',
    updated_at = NOW();

COMMIT;
