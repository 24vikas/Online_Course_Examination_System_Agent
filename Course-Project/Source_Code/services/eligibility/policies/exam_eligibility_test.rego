package exam.eligibility_test

import future.keywords
import data.exam.eligibility

# 1. Fully eligible student
test_fully_eligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-100",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 82.5,
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "ELIGIBLE"
    res.allow == true
    count(res.reasons) == 0
}

# 2. Low attendance without condonation (< 75%)
test_low_attendance_ineligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-101",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 71.0,
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_LOW_ATTENDANCE"]
}

# 3. Medical condonation eligible (65% <= attendance < 75% with approved exemption)
test_medical_condonation_eligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-102",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 68.0,
            "medical_exemption_approved": true,
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "ELIGIBLE"
    res.allow == true
    count(res.reasons) == 0
}

# 4. Severe low attendance (< 65%) even with medical exemption is INELIGIBLE
test_severe_low_attendance_ineligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-103",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 61.5,
            "medical_exemption_approved": true,
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_LOW_ATTENDANCE"]
}

# 5. Unpaid fees
test_unpaid_fees_ineligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-104",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 90.0,
            "fee_cleared": false,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_UNPAID_FEES"]
}

# 6. Disciplinary hold
test_disciplinary_hold_ineligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-105",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 90.0,
            "fee_cleared": true,
            "disciplinary_hold": true,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_DISCIPLINARY_HOLD"]
}

# 7. Prerequisites unsatisfied
test_prerequisites_unmet_ineligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-106",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 88.0,
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": false
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_PREREQUISITE_UNMET"]
}

# 8. Not enrolled
test_not_enrolled_ineligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-107",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": false,
            "attendance_percentage": 85.0,
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_NOT_ENROLLED"]
}

# 9. Cross-tenant mismatch fails closed
test_cross_tenant_mismatch_ineligible if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-108",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-999", # Spoofed/foreign tenant
            "enrolled": true,
            "attendance_percentage": 95.0,
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_CROSS_TENANT_MISMATCH"]
}

# 10. Missing attendance evidence fails closed to PENDING_REVIEW
test_missing_attendance_pending_review if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-109",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            # attendance_percentage missing
            "fee_cleared": true,
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "PENDING_REVIEW"
    res.allow == false
    res.reasons["REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING"]
}

# 11. Missing finance evidence fails closed to PENDING_REVIEW
test_missing_finance_pending_review if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-110",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            "attendance_percentage": 88.0,
            # fee_cleared missing
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "PENDING_REVIEW"
    res.allow == false
    res.reasons["REASON_INCOMPLETE_EVIDENCE:FINANCE_MISSING"]
}

# 12. Ineligible condition takes precedence over missing evidence
test_ineligible_precedence_over_incomplete if {
    input := {
        "tenant_id": "tenant-001",
        "student_id": "student-111",
        "course_offering_id": "course-200",
        "evidence": {
            "tenant_id": "tenant-001",
            "enrolled": true,
            # attendance_percentage missing
            "fee_cleared": false, # Unpaid fee violation!
            "disciplinary_hold": false,
            "prerequisites_satisfied": true
        }
    }
    res := eligibility.evaluation_result with input as input
    res.decision == "INELIGIBLE"
    res.allow == false
    res.reasons["REASON_UNPAID_FEES"]
    res.reasons["REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING"]
}
