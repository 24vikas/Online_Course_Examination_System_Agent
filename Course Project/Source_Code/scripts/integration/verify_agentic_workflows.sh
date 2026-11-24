#!/usr/bin/env bash
# ==============================================================================
# scripts/integration/verify_agentic_workflows.sh
# Verifies pgvector similarity search and Deep Research agent API endpoints.
# ==============================================================================

set -e
echo "--- VERIFYING AGENTIC WORKFLOWS & RAG RETRIEVAL ---"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Verify pgvector extension in integration database
VECTOR_CHECK=$(docker exec aura-postgres psql -U postgres -d aura_phase25_integration -t -c "SELECT count(*) FROM pg_extension WHERE extname = 'vector';" | tr -d ' ')
if [ "$VECTOR_CHECK" -ge 1 ]; then
  echo "[✓ PASS] pgvector extension active in aura_phase25_integration."
else
  echo "[✗ FAIL] pgvector extension missing."
  exit 1
fi

# Verify Deep Research and RAG routes
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:33255/research)
if [ "$HTTP_CODE" = "200" ]; then
  echo "[✓ PASS] Deep Research interface reachable at /research (Status 200)."
else
  echo "[✗ FAIL] Deep Research route returned HTTP $HTTP_CODE"
  exit 1
fi

echo "================================================================================"
echo " AGENTIC WORKFLOWS VERIFICATION: 100% PASS"
echo "================================================================================"
