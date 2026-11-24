BEGIN;

CREATE TABLE exam_paper_snapshots (
  schedule_id uuid PRIMARY KEY REFERENCES exam_schedules(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  questions jsonb NOT NULL CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE exam_paper_answer_keys (
  schedule_id uuid PRIMARY KEY REFERENCES exam_paper_snapshots(schedule_id),
  answer_keys jsonb NOT NULL CHECK (jsonb_typeof(answer_keys) = 'object')
);

ALTER TABLE exam_paper_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_paper_answer_keys ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION protect_exam_paper_snapshot() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Published exam papers are immutable';
END;
$$;

CREATE TRIGGER protect_exam_paper_snapshot
BEFORE UPDATE OR DELETE ON exam_paper_snapshots FOR EACH ROW EXECUTE FUNCTION protect_exam_paper_snapshot();
CREATE TRIGGER protect_exam_paper_answer_keys
BEFORE UPDATE OR DELETE ON exam_paper_answer_keys FOR EACH ROW EXECUTE FUNCTION protect_exam_paper_snapshot();

COMMIT;
