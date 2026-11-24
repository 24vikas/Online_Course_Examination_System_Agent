#!/usr/bin/env bash
# ==============================================================================
# scripts/integration/verify_exam_lifecycle.sh
# Runs full lifecycle integration verification on live server.
# ==============================================================================

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

node "$DIR/scripts/verify_phase25_integration_e2e.cjs"
