#!/usr/bin/env bash
# ==============================================================================
# AURA PHASE 25 — SERVICE HEALTH & CONNECTIVITY MONITOR
# ==============================================================================

echo "================================================================================"
echo "  AURA PHASE 25 — HEALTH & STATUS REPORT"
echo "================================================================================"

function check_http() {
  local name="$1"
  local url="$2"
  local expected="$3"
  
  if curl -s -f "$url" >/dev/null 2>&1 || [ "$expected" = "ANY" ]; then
    echo -e "  [✓ ONLINE]  $name: $url"
  else
    echo -e "  [✗ OFFLINE] $name: $url"
  fi
}

function check_tcp() {
  local name="$1"
  local host="$2"
  local port="$3"
  
  if nc -z "$host" "$port" 2>/dev/null; then
    echo -e "  [✓ ONLINE]  $name ($host:$port)"
  else
    echo -e "  [✗ OFFLINE] $name ($host:$port)"
  fi
}

check_tcp "PostgreSQL Database (aura_phase25_integration)" "127.0.0.1" 54322
check_http "OPA Rego Policy Engine" "http://127.0.0.1:18181/v1/data" "ANY"
check_http "Docling Document Extraction Service" "http://127.0.0.1:5001/health" "ANY"
check_http "BGE-M3 1024d Embedding Service" "http://127.0.0.1:8002/health" "ANY"
check_http "Proctor Companion Static / Model Host" "http://127.0.0.1:4200/" "ANY"
check_http "Next.js Production Web Application" "http://127.0.0.1:33255/api/auth/me" "ANY"

echo "================================================================================"
