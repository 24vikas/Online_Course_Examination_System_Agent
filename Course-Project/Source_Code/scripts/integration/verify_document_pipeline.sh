#!/usr/bin/env bash
# ==============================================================================
# scripts/integration/verify_document_pipeline.sh
# Verifies Docling extraction container and BGE-M3 1024d embedding service.
# ==============================================================================

set -e
echo "--- VERIFYING DOCUMENT EXTRACTION & EMBEDDING PIPELINE ---"

# 1. Docling Service Health
DOCLING_STATUS=$(curl -s http://127.0.0.1:5001/health || true)
if echo "$DOCLING_STATUS" | grep -q '"status":"ok"'; then
  echo "[✓ PASS] Docling document parser is healthy (Port 5001)."
else
  echo "[✗ FAIL] Docling service unreachable at http://127.0.0.1:5001/health"
  exit 1
fi

# 2. BGE-M3 Embedding Service Health
EMBED_STATUS=$(curl -s http://127.0.0.1:8002/health || true)
if echo "$EMBED_STATUS" | grep -q '"dimension":1024'; then
  echo "[✓ PASS] BGE-M3 1024-d embedding worker is healthy (Port 8002)."
else
  echo "[✗ FAIL] BGE-M3 embedding worker unreachable at http://127.0.0.1:8002/health"
  exit 1
fi

echo "================================================================================"
echo " DOCUMENT PIPELINE VERIFICATION: 100% PASS"
echo "================================================================================"
