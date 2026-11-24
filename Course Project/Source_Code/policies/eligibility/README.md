# Academic Eligibility Policies (`policies/eligibility`)

## Policy Architecture

Student eligibility for examination registration and sitting is evaluated deterministically using **Open Policy Agent (OPA)** and versioned **Rego** policies.

### Non-Negotiable Rules
1. **Explainable & Deterministic:** Eligibility is computed from concrete institutional evidence (attendance %, prerequisite completion, fee clearance, disciplinary status).
2. **Fail Closed:** If prerequisite or attendance evidence is missing, the status evaluates to `PENDING_REVIEW` or `UNKNOWN`. Students are **never** eligible by default.
3. **Audited Persistence:** Every evaluation result persists:
   - `tenant_id`
   - `student_id`
   - `course_offering_id` / `exam_id`
   - `policy_version_hash` (Git SHA or content hash of the Rego policy)
   - `evaluator_version` (OPA runtime version)
   - `evidence_snapshot_id` (reference to frozen evidence record)
   - `decision` (`ELIGIBLE`, `INELIGIBLE`, `PENDING_REVIEW`, `UNKNOWN`)
   - `reason_codes` (array of deterministic string identifiers, e.g. `LOW_ATTENDANCE`, `FEES_UNPAID`, `PREREQUISITE_MISSING`)
   - `evaluated_at` (server timestamp)
