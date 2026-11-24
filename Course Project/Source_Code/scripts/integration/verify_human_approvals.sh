#!/usr/bin/env bash
# ==============================================================================
# scripts/integration/verify_human_approvals.sh
# Verifies database triggers and checkpoints protecting human authority.
# ==============================================================================

set -e
echo "--- VERIFYING HUMAN-IN-THE-LOOP DATABASE TRIGGERS ---"

# 1. Trigger assert_blueprint_approved_for_schedule
TRIGGER_CHECK=$(docker exec aura-postgres psql -U postgres -d aura_phase25_integration -t -c "
  SELECT count(*) FROM pg_trigger WHERE tgname = 'trg_assert_blueprint_approved';
" | tr -d ' ')

if [ "$TRIGGER_CHECK" -ge 1 ]; then
  echo "[✓ PASS] trg_assert_blueprint_approved trigger active on exam_schedules."
else
  echo "[✗ FAIL] trg_assert_blueprint_approved trigger missing."
  exit 1
fi

# 2. Trigger lock_coding_problem_revision
CODING_TRIGGER_CHECK=$(docker exec aura-postgres psql -U postgres -d aura_phase25_integration -t -c "
  SELECT count(*) FROM pg_trigger WHERE tgname = 'lock_coding_problem_revision';
" | tr -d ' ')

if [ "$CODING_TRIGGER_CHECK" -ge 1 ]; then
  echo "[✓ PASS] lock_coding_problem_revision immutability trigger active."
else
  echo "[✗ FAIL] lock_coding_problem_revision trigger missing."
  exit 1
fi

echo "================================================================================"
echo " HUMAN APPROVALS CHECKPOINT VERIFICATION: 100% PASS"
echo "================================================================================"
