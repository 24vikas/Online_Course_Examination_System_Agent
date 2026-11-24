BEGIN;
CREATE TABLE exam_registrations (
    tenant_id uuid NOT NULL REFERENCES tenants(id),
    student_id uuid NOT NULL REFERENCES students(id),
    schedule_id uuid NOT NULL REFERENCES exam_schedules(id),
    eligibility_snapshot_id uuid NOT NULL REFERENCES eligibility_snapshots(id),
    registered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    PRIMARY KEY (tenant_id, student_id, schedule_id)
);
ALTER TABLE exam_registrations ENABLE ROW LEVEL SECURITY;
COMMIT;
