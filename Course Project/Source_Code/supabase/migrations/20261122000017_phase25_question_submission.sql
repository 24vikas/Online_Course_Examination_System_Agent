BEGIN;
ALTER TYPE question_review_status_type ADD VALUE IF NOT EXISTS 'PENDING_COE_APPROVAL';
ALTER TABLE question_bank
  ADD COLUMN IF NOT EXISTS authored_by uuid REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS submitted_for_review_at timestamptz;
COMMIT;
