package examination.eligibility_test

import future.keywords.if
import data.examination.eligibility

# 1. Fully eligible student
test_fully_eligible if {
    input := {
        "requirements": {
            "requires_prerequisite": false
        },
        "evidence": {
            "attendance": {
                "attendance_percentage": 85.5
            },
            "finance": {
                "fee_cleared": true
            },
            "disciplinary": {
                "has_active_hold": false
            }
        }
    }

    res := eligibility.decision with input as input
    res == "ELIGIBLE"
    eligibility.eligible with input as input
}

# 2. Ineligible due to low attendance
test_ineligible_low_attendance if {
    input := {
        "requirements": {
            "requires_prerequisite": false
        },
        "evidence": {
            "attendance": {
                "attendance_percentage": 68.0
            },
            "finance": {
                "fee_cleared": true
            },
            "disciplinary": {
                "has_active_hold": false
            }
        }
    }

    res := eligibility.decision with input as input
    res == "INELIGIBLE"
    reasons := eligibility.reasons with input as input
    "REASON_LOW_ATTENDANCE" in reasons
    not eligibility.eligible with input as input
}

# 3. Ineligible due to unpaid fees
test_ineligible_unpaid_fees if {
    input := {
        "requirements": {
            "requires_prerequisite": false
        },
        "evidence": {
            "attendance": {
                "attendance_percentage": 90.0
            },
            "finance": {
                "fee_cleared": false
            },
            "disciplinary": {
                "has_active_hold": false
            }
        }
    }

    res := eligibility.decision with input as input
    res == "INELIGIBLE"
    reasons := eligibility.reasons with input as input
    "REASON_UNPAID_FEES" in reasons
}

# 4. Ineligible due to unmet prerequisite
test_ineligible_unmet_prerequisite if {
    input := {
        "requirements": {
            "requires_prerequisite": true
        },
        "evidence": {
            "attendance": {
                "attendance_percentage": 90.0
            },
            "finance": {
                "fee_cleared": true
            },
            "disciplinary": {
                "has_active_hold": false
            },
            "prerequisites": {
                "satisfied": false
            }
        }
    }

    res := eligibility.decision with input as input
    res == "INELIGIBLE"
    reasons := eligibility.reasons with input as input
    "REASON_PREREQUISITE_UNMET" in reasons
}

# 5. Missing attendance evidence returns PENDING_REVIEW, not eligible
test_missing_evidence_pending_review if {
    input := {
        "requirements": {
            "requires_prerequisite": false
        },
        "evidence": {
            "finance": {
                "fee_cleared": true
            },
            "disciplinary": {
                "has_active_hold": false
            }
        }
    }

    res := eligibility.decision with input as input
    res == "PENDING_REVIEW"
    reasons := eligibility.reasons with input as input
    "REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING" in reasons
    not eligibility.eligible with input as input
}
