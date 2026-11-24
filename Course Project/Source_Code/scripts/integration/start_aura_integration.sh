#!/usr/bin/env bash
# ==============================================================================
# AURA PHASE 25 — UNIFIED INTEGRATION SYSTEM LAUNCHER
# Worktree: /mnt/data/Agentic_AI_project/Online_Examination_System_INTEGRATION
# Target DB: aura_phase25_integration (Port 54322)
# Web Port: 33255 (LAN reachable on 0.0.0.0)
# Companion Port: 4200
# ==============================================================================

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PID_FILE="/tmp/aura_integration_services.pids"

echo "================================================================================"
echo "  STARTING AURA PHASE 25 INTEGRATED SYSTEM (Next.js, Proctor, Reaper, AI)"
echo "================================================================================"

# 1. Check Docker Containers
echo "[1/5] Ensuring backing Docker containers are running..."
for container in aura-postgres aura252-policy aura-docling-serve aura-embedding-worker; do
  if [ "$(docker inspect -f '{{.State.Running}}' $container 2>/dev/null)" != "true" ]; then
    echo "  -> Starting container $container..."
    docker start $container >/dev/null 2>&1 || true
  else
    echo "  ✓ Container $container is running."
  fi
done

# 2. Free up target ports if currently occupied
echo "[2/5] Clearing stale listeners on ports 33255 and 4200..."
fuser -k 33255/tcp >/dev/null 2>&1 || true
fuser -k 4200/tcp >/dev/null 2>&1 || true
rm -f "$PID_FILE"

# 3. Environment Variables
export PGHOST=127.0.0.1
export PGPORT=54322
export PGDATABASE=aura_phase25_integration
export PGUSER=postgres
export PGPASSWORD=postgres
export PORT=33255
export HOSTNAME=0.0.0.0
export NEXT_PUBLIC_COMPANION_PORT=4200
export AURA_REAPER_SECRET=aura_internal_reaper_secret_2026
export NODE_ENV=production

# 4. Start Companion Static & Model Server (Port 4200)
echo "[3/5] Starting Native Proctor Companion Server on http://127.0.0.1:4200..."
cd "$DIR"
nohup python3 scripts/companion_server.py > /tmp/aura_companion.log 2>&1 &
COMPANION_PID=$!
disown $COMPANION_PID 2>/dev/null || true
echo "COMPANION_PID=$COMPANION_PID" >> "$PID_FILE"

# 5. Start Background Proctor Reaper Daemon
echo "[4/5] Starting Background Proctor Reaper Daemon (15s Lease Reaper)..."
nohup node scripts/reaper_daemon.cjs > /tmp/aura_reaper.log 2>&1 &
REAPER_PID=$!
disown $REAPER_PID 2>/dev/null || true
echo "REAPER_PID=$REAPER_PID" >> "$PID_FILE"

LAN_IP=$(hostname -I | awk '{print $1}')

echo ""
echo "================================================================================"
echo "  AURA PHASE 25 SYSTEM IS ONLINE AND FULLY OPERATIONAL"
echo "================================================================================"
echo ""
echo "  Live Application URLs:"
echo "    Local Browser:       http://localhost:33255"
echo "    LAN / WiFi Network:  http://${LAN_IP}:33255"
echo "    Workflow Demo Hub:   http://${LAN_IP}:33255/demo"
echo "    Proctor Companion:   http://127.0.0.1:4200"
echo ""
echo "  One-Click Demo Personas (Available on /login):"
echo "    1. COE Admin:        coe.demo@example.invalid      (Pass: )"
echo "    2. Course Faculty:   uday.demo@example.invalid     (Pass: )"
echo "    3. Candidate:        DEMO094@example.invalid  (Pass: )"
echo "    4. Invigilator:      invigilator.demo@example.invalid (Pass: )"
echo ""
echo "  Service Management:"
echo "    Check Health:        bash scripts/integration/check_aura_services.sh"
echo "    Stop System:         bash scripts/integration/stop_aura_integration.sh"
echo "================================================================================"

# 6. Start Next.js Integrated Web Server (Port 33255)
echo "[5/5] Starting Next.js Production Web Server on http://0.0.0.0:33255..."
cd "$DIR/apps/web"
exec npx next start -p 33255 -H 0.0.0.0
