BEGIN;
CREATE TABLE aura_password_credentials (
    membership_id uuid PRIMARY KEY REFERENCES tenant_memberships(id) ON DELETE CASCADE,
    student_id uuid REFERENCES students(id) ON DELETE RESTRICT,
    password_hash text,
    activation_hash text UNIQUE,
    activation_expires_at timestamptz,
    disabled_at timestamptz,
    CHECK ((activation_hash IS NULL) = (activation_expires_at IS NULL)),
    CHECK (password_hash IS NOT NULL OR activation_hash IS NOT NULL)
);
CREATE UNIQUE INDEX uq_aura_password_student ON aura_password_credentials (student_id)
WHERE student_id IS NOT NULL;
CREATE TABLE aura_web_sessions (
    token_hash text PRIMARY KEY,
    membership_id uuid NOT NULL REFERENCES aura_password_credentials(membership_id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz
);
CREATE INDEX idx_aura_web_sessions_membership ON aura_web_sessions (membership_id);
ALTER TABLE aura_password_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE aura_web_sessions ENABLE ROW LEVEL SECURITY;
COMMIT;
