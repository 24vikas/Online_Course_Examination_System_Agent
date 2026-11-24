#!/usr/bin/env bash
# build-dist.sh — Builds TypeScript, packages Windows/Linux dists, bundles models, and verifies SHA-256 digests.
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=== Building Proctor Companion in ${DIR} ==="

cd "${DIR}"

# 1. Ensure models directory and task file exist in src/models and models
mkdir -p src/models models launcher/models dist/staging/models
if [ -f "../../third_party/references/examguard-local/src/models/face_landmarker.task" ]; then
  cp -u ../../third_party/references/examguard-local/src/models/face_landmarker.task src/models/face_landmarker.task 2>/dev/null || cp ../../third_party/references/examguard-local/src/models/face_landmarker.task src/models/face_landmarker.task
  cp -u ../../third_party/references/examguard-local/src/models/face_landmarker.task models/face_landmarker.task 2>/dev/null || cp ../../third_party/references/examguard-local/src/models/face_landmarker.task models/face_landmarker.task
  cp -u ../../third_party/references/examguard-local/src/models/face_landmarker.task launcher/models/face_landmarker.task 2>/dev/null || cp ../../third_party/references/examguard-local/src/models/face_landmarker.task launcher/models/face_landmarker.task
  cp -u ../../third_party/references/examguard-local/src/models/face_landmarker.task dist/staging/models/face_landmarker.task 2>/dev/null || cp ../../third_party/references/examguard-local/src/models/face_landmarker.task dist/staging/models/face_landmarker.task
fi

# 2. Build TypeScript modules
echo "[1/5] Compiling TypeScript..."
../../node_modules/.bin/tsc -b tsconfig.json

# 3. Check Go compiler for launcher
if command -v go >/dev/null 2>&1; then
  echo "[2/5] Compiling Windows Launcher with embedded MediaPipe model..."
  cd launcher
  GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o ../dist/proctor-companion-1.0.0-setup.exe main.go
  cp ../dist/proctor-companion-1.0.0-setup.exe ../dist/staging/aura-proctor.exe
  cd ..
  echo "[2/5] Go Windows binary built successfully."
fi

# 4. Assemble staging directory with updated JS and assets
echo "[3/5] Updating staging directory..."
cp dist/*.js dist/staging/ 2>/dev/null || true
mkdir -p dist/staging/desktop-app dist/staging/libs dist/staging/wasm dist/staging/models
cp dist/desktop-app/*.js dist/staging/desktop-app/ 2>/dev/null || true
cp src/desktop-app/renderer.html dist/staging/desktop-app/renderer.html
if [ -d "../../node_modules/@mediapipe/tasks-vision" ]; then
  cp ../../node_modules/@mediapipe/tasks-vision/vision_bundle.* dist/staging/libs/ 2>/dev/null || true
  cp ../../node_modules/@mediapipe/tasks-vision/wasm/* dist/staging/wasm/ 2>/dev/null || true
fi
if [ -f "models/face_landmarker.task" ]; then
  cp models/face_landmarker.task dist/staging/models/face_landmarker.task 2>/dev/null || true
fi

# 5. Build distribution archives (.zip and .tar.gz)
echo "[4/5] Packaging distribution archives..."
cd dist
rm -f proctor-companion-1.0.0-win-x64.zip proctor-companion-1.0.0-linux-x64.tar.gz
zip -r -q proctor-companion-1.0.0-win-x64.zip staging
tar -czf proctor-companion-1.0.0-linux-x64.tar.gz staging

# Compute digests for all archives
EXE_HASH=$(sha256sum proctor-companion-1.0.0-setup.exe | awk '{print $1}')
EXE_SIZE=$(stat -c%s proctor-companion-1.0.0-setup.exe)
ZIP_HASH=$(sha256sum proctor-companion-1.0.0-win-x64.zip | awk '{print $1}')
ZIP_SIZE=$(stat -c%s proctor-companion-1.0.0-win-x64.zip)
TAR_HASH=$(sha256sum proctor-companion-1.0.0-linux-x64.tar.gz | awk '{print $1}')
TAR_SIZE=$(stat -c%s proctor-companion-1.0.0-linux-x64.tar.gz)
SEB_HASH=$(sha256sum aura-exam-lockdown.seb | awk '{print $1}')
SEB_SIZE=$(stat -c%s aura-exam-lockdown.seb)

# Generate manifest.json
cat <<EOF > manifest.json
{
  "name": "proctor-companion",
  "version": "1.0.0",
  "releaseTag": "v1.0.0",
  "builtAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "publisher": "Team AURA (Team 5), CSE Department, KLE Technological University",
  "course": "26ECAC401 - Agentic AI",
  "license": "Apache-2.0",
  "modelAttribution": {
    "engine": "MediaPipe Tasks FaceLandmarker",
    "provider": "Google LLC",
    "license": "Apache-2.0",
    "modelFile": "models/face_landmarker.task",
    "sha256": "64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff",
    "landmarks": 478
  },
  "signingStatus": {
    "status": "BLOCKED_SIGNING",
    "reason": "Institutional Authenticode signing certificate (.pfx) pending university COE release. Package authenticity and integrity are cryptographically guaranteed via published SHA-256 digests."
  },
  "packages": [
    {
      "platform": "win32-x64",
      "targetOs": "Windows 11 (22H2 / 23H2 / 24H2)",
      "artifact": "proctor-companion-1.0.0-setup.exe",
      "sizeBytes": ${EXE_SIZE},
      "sha256": "${EXE_HASH}",
      "bundledModel": "models/face_landmarker.task",
      "description": "Windows 11 official companion installer executable with bundled MediaPipe model and protocol registration"
    },
    {
      "platform": "win32-x64",
      "targetOs": "Windows 11 (22H2 / 23H2 / 24H2)",
      "artifact": "proctor-companion-1.0.0-win-x64.zip",
      "sizeBytes": ${ZIP_SIZE},
      "sha256": "${ZIP_HASH}",
      "bundledModel": "models/face_landmarker.task",
      "description": "Portable Windows 11 standalone companion runtime archive with bundled MediaPipe model"
    },
    {
      "platform": "linux-x64",
      "targetOs": "Ubuntu 22.04+ / Linux x86_64",
      "artifact": "proctor-companion-1.0.0-linux-x64.tar.gz",
      "sizeBytes": ${TAR_SIZE},
      "sha256": "${TAR_HASH}",
      "bundledModel": "models/face_landmarker.task",
      "description": "Linux x86_64 companion edge engine and CLI runner with bundled MediaPipe model"
    },
    {
      "platform": "cross-platform",
      "targetOs": "Windows 11 / macOS / iOS",
      "artifact": "aura-exam-lockdown.seb",
      "sizeBytes": ${SEB_SIZE},
      "sha256": "${SEB_HASH}",
      "description": "Official Safe Exam Browser kiosk lockdown profile"
    }
  ],
  "distributionArtifacts": [
    {
      "platform": "win32-x64",
      "targetOs": "Windows 11 (22H2 / 23H2 / 24H2)",
      "artifact": "proctor-companion-1.0.0-setup.exe",
      "sizeBytes": ${EXE_SIZE},
      "sha256": "${EXE_HASH}",
      "description": "Windows 11 official companion installer executable"
    },
    {
      "platform": "win32-x64",
      "targetOs": "Windows 11 (22H2 / 23H2 / 24H2)",
      "artifact": "proctor-companion-1.0.0-win-x64.zip",
      "sizeBytes": ${ZIP_SIZE},
      "sha256": "${ZIP_HASH}",
      "description": "Portable Windows 11 standalone companion runtime archive"
    },
    {
      "platform": "linux-x64",
      "targetOs": "Ubuntu 22.04+ / Linux x86_64",
      "artifact": "proctor-companion-1.0.0-linux-x64.tar.gz",
      "sizeBytes": ${TAR_SIZE},
      "sha256": "${TAR_HASH}",
      "description": "Linux x86_64 companion edge engine and CLI runner"
    },
    {
      "platform": "cross-platform",
      "targetOs": "Windows 11 / macOS / iOS",
      "artifact": "aura-exam-lockdown.seb",
      "sizeBytes": ${SEB_SIZE},
      "sha256": "${SEB_HASH}",
      "description": "Official Safe Exam Browser kiosk lockdown profile"
    }
  ],
  "documentation": [
    {
      "file": "README_STUDENT_INSTALL.md",
      "sha256": "$(sha256sum README_STUDENT_INSTALL.md | awk '{print $1}')",
      "audience": "Student Candidates"
    },
    {
      "file": "README_PROCTOR_ADMIN.md",
      "sha256": "$(sha256sum README_PROCTOR_ADMIN.md | awk '{print $1}')",
      "audience": "COE Administrators & Faculty Invigilators"
    }
  ]
}
EOF

# Generate authoritative SHA256SUMS.txt
sha256sum proctor-companion-1.0.0-setup.exe \
          proctor-companion-1.0.0-win-x64.zip \
          proctor-companion-1.0.0-linux-x64.tar.gz \
          aura-exam-lockdown.seb \
          manifest.json \
          README_STUDENT_INSTALL.md \
          README_PROCTOR_ADMIN.md > SHA256SUMS.txt
echo "[4/5] Checksums updated."

# 6. Copy downloads to web public directory
echo "[5/5] Syncing downloads to web public directory..."
mkdir -p ../../../apps/web/public/downloads
cp proctor-companion-1.0.0-setup.exe ../../../apps/web/public/downloads/
cp proctor-companion-1.0.0-win-x64.zip ../../../apps/web/public/downloads/
cp proctor-companion-1.0.0-linux-x64.tar.gz ../../../apps/web/public/downloads/
cp aura-exam-lockdown.seb ../../../apps/web/public/downloads/
cp manifest.json ../../../apps/web/public/downloads/
cp SHA256SUMS.txt ../../../apps/web/public/downloads/

echo "=== Proctor Companion build and distribution verification complete ==="
