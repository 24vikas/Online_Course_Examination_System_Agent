package examination.eligibility

import future.keywords.in
import future.keywords.if

# Default outcome if evaluation cannot complete
default eligible := false

# Deterministic Reason Codes
# REASON_OK: All institutional requirements verified and satisfied
# REASON_LOW_ATTENDANCE: Student attendance percentage below mandated threshold
# REASON_UNPAID_FEES: Outstanding institutional or examination fees detected
# REASON_PREREQUISITE_UNMET: Academic prerequisites not satisfied
# REASON_DISCIPLINARY_HOLD: Disciplinary action blocking exam participation
# REASON_INCOMPLETE_EVIDENCE: One or more evidence records missing from input

# Threshold defaults
min_attendance_pct := 75.0

# Extract reasons why a student is ineligible
reasons[reason] if {
    not input.evidence.attendance
    reason := "REASON_INCOMPLETE_EVIDENCE:ATTENDANCE_MISSING"
}

reasons[reason] if {
    input.evidence.attendance.attendance_percentage < min_attendance_pct
    reason := "REASON_LOW_ATTENDANCE"
}

reasons[reason] if {
    not input.evidence.finance
    reason := "REASON_INCOMPLETE_EVIDENCE:FINANCE_MISSING"
}

reasons[reason] if {
    input.evidence.finance.fee_cleared != true
    reason := "REASON_UNPAID_FEES"
}

reasons[reason] if {
    input.evidence.disciplinary.has_active_hold == true
    reason := "REASON_DISCIPLINARY_HOLD"
}

reasons[reason] if {
    input.requirements.requires_prerequisite == true
    not input.evidence.prerequisites.satisfied == true
    reason := "REASON_PREREQUISITE_UNMET"
}

# Decision calculation
decision := "PENDING_REVIEW" if {
    count([r | reasons[r]; startswith(r, "REASON_INCOMPLETE_EVIDENCE")]) > 0
} else := "INELIGIBLE" if {
    count(reasons) > 0
} else := "ELIGIBLE"

eligible := true if {
    decision == "ELIGIBLE"
}
