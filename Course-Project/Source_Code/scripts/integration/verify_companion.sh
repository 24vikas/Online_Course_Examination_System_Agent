#!/usr/bin/env bash
# ==============================================================================
# scripts/integration/verify_companion.sh
# Runs the 8-test companion hardening & anti-forgery test suite.
# ==============================================================================

set -e
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

export PGDATABASE=aura_phase25_integration
export PGPORT=54322

node "$DIR/scripts/test_security_hardening.cjs"
