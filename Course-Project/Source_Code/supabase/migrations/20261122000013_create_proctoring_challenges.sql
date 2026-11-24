-- Restore the missing prerequisite for the existing telemetry migration.
-- New installations apply this before 20261122000014; existing installations
-- that already have the table retain their records.
CREATE TABLE IF NOT EXISTS exam_proctoring_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  attempt_id uuid NOT NULL REFERENCES exam_attempts(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  challenge_token text NOT NULL,
  challenge_token_hash varchar(64) NOT NULL,
  pin_code varchar(8),
  pin_code_hash varchar(64),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_proctor_challenge_token_hash
  ON exam_proctoring_challenges(challenge_token_hash);
CREATE INDEX IF NOT EXISTS idx_proctor_challenge_pin_hash
  ON exam_proctoring_challenges(pin_code_hash) WHERE pin_code_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_proctor_challenge_attempt
  ON exam_proctoring_challenges(tenant_id, attempt_id, expires_at DESC);
ALTER TABLE exam_proctoring_challenges ENABLE ROW LEVEL SECURITY;
