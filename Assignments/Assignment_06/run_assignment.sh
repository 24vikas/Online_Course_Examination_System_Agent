#!/usr/bin/env bash
# Automated Verification Script for Assignment 06 (Lab L6)
# Course: 26ECAC401 — Agentic AI, KLE Technological University

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CODE_DIR="${SCRIPT_DIR}/../../Course-Project/Source_Code"
DEV_DIR="/mnt/data/Agentic_AI_project/Online_Examination_System_PHASE25"

echo "============================================================"
echo " Running Automated Test for Assignment 06 (Pattern: L6)"
echo "============================================================"

# Check if node_modules exists in Code directory, otherwise fallback to development workspace
if [ -d "${CODE_DIR}/node_modules" ]; then
  cd "${CODE_DIR}"
elif [ -d "${DEV_DIR}/node_modules" ]; then
  cd "${DEV_DIR}"
else
  echo "[ERROR] node_modules not found. Run 'npm install' in '${CODE_DIR}' first."
  exit 1
fi

node --test --experimental-strip-types --test-name-pattern="L6" services/api/tests/agentic-worklet.test.ts

echo ""
echo "[SUCCESS] Assignment 06 automated test completed successfully!"
