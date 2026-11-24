BEGIN;
ALTER TABLE exam_proctoring_sessions ADD COLUMN telemetry_expires_at timestamptz;
CREATE UNIQUE INDEX uq_proctor_telemetry_credential ON exam_proctoring_sessions (session_token_hash)
WHERE telemetry_expires_at IS NOT NULL;
ALTER TABLE exam_proctoring_challenges ADD COLUMN authenticated_pairing boolean NOT NULL DEFAULT false;
COMMIT;
