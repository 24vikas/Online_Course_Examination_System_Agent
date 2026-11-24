package exam.eligibility

import future.keywords

# Metadata
policy_id := "opa.policy.exam_eligibility"
policy_version := "1.0.0"
policy_hash := "sha256:7f9c8d5a1b2e3f4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c"
evaluator_version := "opa:0.68.0"

# Default decision is fail-closed
default allow := false
default decision := "PENDING_REVIEW"

# Minimum required attendance percentage (KLE Tech academic regulation)
min_attendance_threshold := 75.0
condonation_attendance_threshold := 65.0

# Reason code collections
reasons contains reason if {
    some r in missing_evidence_reasons
    reason := r
}

reasons contains reason if {
    some r in ineligibility_reasons
    reason := r
}

# 1. Missing Evidence Checks (Fail-closed to PENDING_REVIEW)
missing_evidence_reasons contains "REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING" if {
    not is_number(object.get(input.evidence, "attendance_percentage", null))
}

missing_evidence_reasons contains "REASON_INCOMPLETE_EVIDENCE:FINANCE_MISSING" if {
    not is_boolean(object.get(input.evidence, "fee_cleared", null))
}

missing_evidence_reasons contains "REASON_INCOMPLETE_EVIDENCE:PREREQUISITES_MISSING" if {
    not is_boolean(object.get(input.evidence, "prerequisites_satisfied", null))
}

missing_evidence_reasons contains "REASON_INCOMPLETE_EVIDENCE:ENROLLMENT_MISSING" if {
    not is_boolean(object.get(input.evidence, "enrolled", null))
}

# 2. Ineligibility Violations
ineligibility_reasons contains "REASON_CROSS_TENANT_MISMATCH" if {
    input.tenant_id != input.evidence.tenant_id
}

ineligibility_reasons contains "REASON_NOT_ENROLLED" if {
    input.evidence.enrolled == false
}

ineligibility_reasons contains "REASON_LOW_ATTENDANCE" if {
    is_number(input.evidence.attendance_percentage)
    input.evidence.attendance_percentage < min_attendance_threshold
    not has_approved_medical_condonation
}

ineligibility_reasons contains "REASON_UNPAID_FEES" if {
    input.evidence.fee_cleared == false
}

ineligibility_reasons contains "REASON_DISCIPLINARY_HOLD" if {
    input.evidence.disciplinary_hold == true
}

ineligibility_reasons contains "REASON_PREREQUISITE_UNMET" if {
    input.evidence.prerequisites_satisfied == false
}

# Medical condonation rule: Attendance between 65% and 75% with verified medical exemption
has_approved_medical_condonation if {
    is_number(input.evidence.attendance_percentage)
    input.evidence.attendance_percentage >= condonation_attendance_threshold
    input.evidence.attendance_percentage < min_attendance_threshold
    input.evidence.medical_exemption_approved == true
}

# 3. Decision Evaluation
decision := "INELIGIBLE" if {
    count(ineligibility_reasons) > 0
}

decision := "PENDING_REVIEW" if {
    count(ineligibility_reasons) == 0
    count(missing_evidence_reasons) > 0
}

decision := "ELIGIBLE" if {
    count(ineligibility_reasons) == 0
    count(missing_evidence_reasons) == 0
}

allow if {
    decision == "ELIGIBLE"
}

# Authoritative Snapshot Output
evaluation_result := {
    "decision": decision,
    "allow": allow,
    "reasons": reasons,
    "policy_id": policy_id,
    "policy_version": policy_version,
    "policy_hash": policy_hash,
    "evaluator_version": evaluator_version,
    "evaluated_at": time.now_ns(),
    "student_id": input.student_id,
    "course_offering_id": input.course_offering_id,
    "tenant_id": input.tenant_id,
    "attendance_percentage": object.get(input.evidence, "attendance_percentage", null),
    "fee_cleared": object.get(input.evidence, "fee_cleared", null),
    "disciplinary_hold": object.get(input.evidence, "disciplinary_hold", null),
    "prerequisites_satisfied": object.get(input.evidence, "prerequisites_satisfied", null)
}
