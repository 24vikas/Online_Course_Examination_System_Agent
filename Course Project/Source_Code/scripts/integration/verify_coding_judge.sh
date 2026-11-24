#!/usr/bin/env bash
# ==============================================================================
# scripts/integration/verify_coding_judge.sh
# Runs the 7-test Bubblewrap isolated execution judge test suite.
# ==============================================================================

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export PGDATABASE=aura_phase25_integration
export PGPORT=54322

node "$DIR/scripts/test_coding_judge_e2e.cjs"
