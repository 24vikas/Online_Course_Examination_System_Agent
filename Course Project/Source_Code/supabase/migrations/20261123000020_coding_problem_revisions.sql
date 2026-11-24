BEGIN;

ALTER TABLE question_bank ADD CONSTRAINT uq_coding_question_tenant UNIQUE (tenant_id, id);

CREATE TABLE coding_problem_revisions (
  tenant_id uuid NOT NULL,
  question_id uuid NOT NULL,
  revision_id uuid NOT NULL DEFAULT gen_random_uuid(),
  public_problem jsonb NOT NULL CHECK (jsonb_typeof(public_problem) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, question_id, revision_id),
  FOREIGN KEY (tenant_id, question_id) REFERENCES question_bank(tenant_id, id)
);

CREATE TABLE coding_hidden_test_sets (
  tenant_id uuid NOT NULL,
  question_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  hidden_tests jsonb NOT NULL CHECK (
    jsonb_typeof(hidden_tests) = 'array' AND jsonb_array_length(hidden_tests) BETWEEN 1 AND 100
  ),
  PRIMARY KEY (tenant_id, question_id, revision_id),
  FOREIGN KEY (tenant_id, question_id, revision_id)
    REFERENCES coding_problem_revisions(tenant_id, question_id, revision_id)
);

ALTER TABLE coding_problem_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE coding_hidden_test_sets ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION prevent_coding_revision_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Coding problem revisions are immutable';
END;
$$;

CREATE TRIGGER lock_coding_problem_revision BEFORE UPDATE OR DELETE ON coding_problem_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_coding_revision_mutation();
CREATE TRIGGER lock_coding_hidden_tests BEFORE UPDATE OR DELETE ON coding_hidden_test_sets
FOR EACH ROW EXECUTE FUNCTION prevent_coding_revision_mutation();

COMMIT;
