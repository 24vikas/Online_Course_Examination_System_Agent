#!/usr/bin/env bash
# ==============================================================================
# AURA PHASE 25 — UNIFIED INTEGRATION SYSTEM STOP SCRIPT
# ==============================================================================

PID_FILE="/tmp/aura_integration_services.pids"

echo "Stopping AURA Integrated Services..."

if [ -f "$PID_FILE" ]; then
  source "$PID_FILE"
  if [ -n "$WEB_PID" ]; then
    kill -TERM "$WEB_PID" 2>/dev/null || true
  fi
  if [ -n "$COMPANION_PID" ]; then
    kill -TERM "$COMPANION_PID" 2>/dev/null || true
  fi
  if [ -n "$REAPER_PID" ]; then
    kill -TERM "$REAPER_PID" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
fi

# Fallback cleanup on designated ports
fuser -k 33255/tcp >/dev/null 2>&1 || true
fuser -k 4200/tcp >/dev/null 2>&1 || true
pkill -f "reaper_daemon.cjs" >/dev/null 2>&1 || true

echo "✓ All AURA integrated services stopped cleanly."
