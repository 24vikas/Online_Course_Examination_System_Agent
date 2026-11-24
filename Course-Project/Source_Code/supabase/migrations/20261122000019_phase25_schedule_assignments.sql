BEGIN;
ALTER TABLE exam_schedules ADD COLUMN invigilator_membership_id uuid REFERENCES tenant_memberships(id);
CREATE TABLE exam_schedule_candidates (
  schedule_id uuid NOT NULL REFERENCES exam_schedules(id),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  student_id uuid NOT NULL REFERENCES students(id),
  PRIMARY KEY (schedule_id, student_id)
);
ALTER TABLE exam_schedule_candidates ENABLE ROW LEVEL SECURITY;
COMMIT;
