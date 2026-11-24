# COE Administrator & Invigilator Proctoring Architecture Manual
**KLE Technological University — School of Computer Science & Engineering**  
**Course 26ECAC401: Agentic AI — Team AURA (Team 5)**

---

## 1. Executive Architecture & Deterministic Safety Boundary

The AURA Proctor Companion is a layered, multi-tier exam security system engineered to safeguard academic integrity while strictly adhering to the **Deterministic Authority Principle**:

```
+-----------------------------------------------------------------------------------+
|                            LAYER 1: OS & KIOSK LOCKDOWN                           |
|  Safe Exam Browser (.seb) or Windows Protocol Launcher (aura-proctor.exe)          |
|  - Blocks Alt+Tab, Task Switcher, PrintScreen, Clipboard, Multiple Monitors        |
|  - Kills prohibited background processes (TeamViewer, AnyDesk, Discord, etc.)     |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                        LAYER 2: EDGE BIOMETRIC INFERENCE                          |
|  Local Edge MediaPipe Pipeline (468-point Mesh, Iris Tracking, 3D Pose Geometry)  |
|  - Single candidate presence & live bounding box detection                        |
|  - Baseline reference photo facial continuity validation                          |
|  - Real-time Yaw / Pitch / Roll head pose & display gaze tracking                 |
|  - Client-side microphone energy & Voice Activity Detection (VAD)                 |
|  * Note: Raw video/audio NEVER leaves the student workstation unencrypted.        |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼ WSS / TLS 1.3 Telemetry Stream
+-----------------------------------------------------------------------------------+
|                    LAYER 3: AUTHORITATIVE BACKEND & ENTRY GATE                    |
|  PostgreSQL-Backed Proctor Companion Service (@exam-system/api)                   |
|  - Single-use challenge token consumption (Anti-replay defense, 300s TTL)         |
|  - SEB Config Key cryptographic verification (timingSafeEqual)                    |
|  - Rule-based deterministic incident evaluation & audit logging                   |
+-----------------------------------------------------------------------------------+
                                         │
                                         ▼
+-----------------------------------------------------------------------------------+
|                       LAYER 4: HUMAN-IN-THE-LOOP TRIAGE                           |
|  COE Administrator & Faculty Invigilation Dashboard                               |
|  - Live split-screen session monitoring & incident timeline review                |
|  - Faculty retains 100% sole grading and disciplinary authority                   |
|  - AI models strictly act as advisory/telemetry sensors; NEVER auto-disqualify   |
+-----------------------------------------------------------------------------------+
```

---

## 2. Telemetry Signal Ingestion & Threshold Rules

The edge companion emits structured telemetry frames at 1–5 Hz. The authoritative backend (`ProctorCompanionService`) evaluates deterministic violation rules:

### A. Telemetry Frame Schema
```typescript
interface TelemetryFrame {
  sequenceNumber: number;
  timestamp: string; // ISO 8601
  facePresence: {
    isFacePresent: boolean;
    faceCount: number;
    detectionConfidence: number;
  };
  headPose: {
    pitchDegrees: number; // Vertical tilt
    yawDegrees: number;   // Horizontal turn
    rollDegrees: number;
    trackingConfidence: number;
  };
  displayGaze: {
    normalizedX: number; // 0.0 to 1.0 (screen viewport)
    normalizedY: number;
    isOnScreen: boolean;
    fixationDurationMs: number;
  };
  osIntegrity: {
    isWindowFocused: boolean;
    isFullScreen: boolean;
    clipboardEventsCount: number;
    displayCount: number;
  };
}
```

### B. Authoritative Incident Thresholds

| Signal / Rule | Trigger Condition | Severity | System Action |
|---|---|---|---|
| **FACE_ABSENT** | `isFacePresent == false` (> 3 consecutive checks) | `MEDIUM` | Log incident with timestamp & duration. Display visual nudge to candidate. |
| **MULTIPLE_FACES** | `faceCount > 1` | `HIGH` | Immediate red alert banner on student screen. High-priority flag on invigilator console. |
| **EXTREME_HEAD_POSE** | `abs(yaw) > 35°` OR `abs(pitch) > 30°` | `LOW` | Log incident with 3D pose Euler angles. |
| **GAZE_EXCURSION** | `!isOnScreen` AND `fixationDurationMs > 3500ms` | `LOW` | Log incident with normalized gaze screen coordinates. |
| **WINDOW_BLUR** | `isWindowFocused == false` OR `!isFullScreen` | `MEDIUM` | Intercept window defocus event. Require immediate candidate refocus. |
| **SEB_VIOLATION** | SEB Header missing or hash mismatch | `CRITICAL` | Deny exam entry gate (`canEnterExam: false`). |

---

## 3. Safe Exam Browser (.seb) Cryptographic Enforcement

For high-stakes summative exams, the Controller of Examinations enforces the official Safe Exam Browser kiosk:

1. **Configuration Key Hash Equation**:
   $$\text{SEB-Config-Key-Hash} = \text{SHA256}(\text{RequestURL} + \text{ConfigKey})$$
2. **Header Verification**:
   The incoming student HTTP request must supply the header `X-SafeExamBrowser-ConfigKeyHash`.
3. **Constant-Time Verification**:
   The backend executes `crypto.timingSafeEqual` between the received header and the server-computed SHA-256 digest to prevent timing side-channel attacks.
4. **Prohibited Processes**:
   The SEB profile (`aura-exam-lockdown.seb`) terminates:
   - `TeamViewer.exe`
   - `AnyDesk.exe`
   - `Discord.exe`
   - `ChatGPT.exe`

---

## 4. Release Distribution Artifacts & Hashes

The release directory `packages/proctor-companion/dist/` contains signed artifacts with published cryptographic digests:

| File Name | Size | SHA-256 Checksum |
|---|---|---|
| `proctor-companion-1.0.0-setup.exe` | 6.0 MB | `960cbca6f0e6b649cb20afbe83562d9fefd5d0b6bd7690133ca5b17f9c1bd2e3` |
| `proctor-companion-1.0.0-win-x64.zip` | 2.5 MB | `53b783965acbca2f5fdd8c83431d158f7f86640d85026aaae50a85099361a124` |
| `proctor-companion-1.0.0-linux-x64.tar.gz` | 2.5 MB | `ccd8e6bcfdd6c496c91446e2bae71f3566129496ef68cf0fc886b8b680354402` |
| `aura-exam-lockdown.seb` | 5.2 KB | `ef5da626f87b172e1d57e48fef25c28132bda918896f0803a498b93ef31f6b31` |

---

## 5. COE Incident Triage & Resolution Procedure

When an incident is flagged in `exam_proctoring_incidents`:

1. Invigilator inspects timestamp, snapshot evidence, and telemetry stream in the Invigilator Dashboard (`/api/invigilator/incidents`).
2. Candidate response can be queried via the live chat channel.
3. Decision outcomes:
   - **DISMISSED**: Minor head movement, sneeze, lighting fluctuation. Incident dismissed with reviewer rationale.
   - **CONFIRMED_VIOLATION**: Unambiguous third-party assistance, unauthorized materials, or prolonged absence. Incident confirmed and forwarded to the Academic Malpractice Committee.
4. **Final Rule**: An AI recommendation or telemetry flag **NEVER** automatically alters marks, terminates student attempts, or revokes exam results without explicit COE human ratification.

---

## 6. Platform Capability Matrix — Windows Enforced vs Linux Monitored

| Security Layer | Windows 10/11 (Enforced) | Linux Ubuntu 22.04+ (Monitored) | Failure / Bypass Handling |
|---|---|---|---|
| **OS Kiosk Lockdown** | **Enforced**: Safe Exam Browser (SEB) exclusive desktop shell + process supervisor. | **Monitored**: HTML5 Fullscreen + Companion window focus tracking. | Defocus logged as WINDOW_BLUR incident. |
| **Keyboard Hook Blocking** | **Enforced**: Win32 WH_KEYBOARD_LL hooks block Alt+Tab, PrintScreen, Win+key. | **Monitored**: DOM keydown listeners log violations. | Copy/Paste logged as LOCKDOWN_VIOLATION. |
| **Prohibited App Termination** | **Enforced**: SEB auto-terminates TeamViewer, AnyDesk, Discord, ChatGPT. | **Monitored**: /proc scan detects prohibited process names. | Not auto-killed on Linux; incidents logged. |
| **Multi-Display Blocking** | **Enforced**: SEB disables secondary monitors via DirectShow exclusive mode. | **Monitored**: window.screen displayCount check. | Incident if displayCount > 1. |
| **Camera Exclusive Acquire** | **Enforced**: Exclusive DirectShow acquisition via companion. | **Enforced**: Exclusive /dev/video0 V4L2 acquire. | CAMERA_DISCONNECTED alert on failure. |
| **SEB Config Hash Verify** | **Enforced**: AURA server crypto.timingSafeEqual over SHA-256 of .seb config. | N/A: SEB not natively available on Linux. | 403 Forbidden on hash mismatch (Windows). |
| **Testbed Status** | BLOCKED — NOT RUN (Windows device required) | PASS (Linux verified on dev host) | Documented per Gate D. |
