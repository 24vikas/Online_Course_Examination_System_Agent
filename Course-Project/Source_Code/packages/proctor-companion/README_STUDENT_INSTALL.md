# Student Installation & Onboarding Guide — AURA Proctor Companion v1.0.0
**KLE Technological University — School of Computer Science & Engineering**  
**Course 26ECAC401: Agentic AI — Team AURA (Team 5)**

---

## 1. System Requirements

| Component | Minimum Specification | Recommended |
|---|---|---|
| **Operating System** | Windows 11 (22H2 / 23H2 / 24H2) 64-bit or Ubuntu 22.04+ | Windows 11 64-bit |
| **Processor** | Dual-core x86_64, 2.0 GHz | Quad-core x86_64 with AVX2 support |
| **Memory (RAM)** | 4 GB | 8 GB or higher |
| **Camera** | Built-in or USB webcam (720p @ 30 FPS) | 1080p @ 30 FPS |
| **Microphone** | Integrated or external microphone | Headset or desktop microphone |
| **Display** | Single primary monitor (1280x720 min) | Single 1920x1080 (Dual monitors prohibited) |
| **Network** | 1.5 Mbps stable broadband / 4G | 5 Mbps low-latency broadband (< 50ms ping) |

---

## 2. Package Downloads & Cryptographic Checksums

Before executing any downloaded file, verify its SHA-256 hash against the official COE registry manifest:

| Package Artifact | Purpose | Official SHA-256 Checksum |
|---|---|---|
| `proctor-companion-1.0.0-setup.exe` | Windows 11 Installer & Companion Launcher | `960cbca6f0e6b649cb20afbe83562d9fefd5d0b6bd7690133ca5b17f9c1bd2e3` |
| `proctor-companion-1.0.0-win-x64.zip` | Portable Windows 11 Client Archive | `53b783965acbca2f5fdd8c83431d158f7f86640d85026aaae50a85099361a124` |
| `proctor-companion-1.0.0-linux-x64.tar.gz` | Linux x86_64 Edge Engine | `ccd8e6bcfdd6c496c91446e2bae71f3566129496ef68cf0fc886b8b680354402` |
| `aura-exam-lockdown.seb` | Safe Exam Browser Official Configuration | `ef5da626f87b172e1d57e48fef25c28132bda918896f0803a498b93ef31f6b31` |

### Verifying SHA-256 in Windows PowerShell:
```powershell
Get-FileHash .\proctor-companion-1.0.0-setup.exe -Algorithm SHA256
```
Confirm the output hash matches `960cbca6f0e6b649cb20afbe83562d9fefd5d0b6bd7690133ca5b17f9c1bd2e3`.

---

## 3. Step-by-Step Installation

### Option A: Standard Windows 11 Setup (Recommended)
1. Download `proctor-companion-1.0.0-setup.exe` from the exam preflight portal.
2. Double-click `proctor-companion-1.0.0-setup.exe`.
3. If Windows SmartScreen displays *"Windows protected your PC"*:
   - Click **More info**.
   - Click **Run anyway** (Academic distribution self-contained executable).
4. Run with `--install` to register the `aura-proctor://` protocol handler in your user registry:
   ```cmd
   proctor-companion-1.0.0-setup.exe --install
   ```
5. Run hardware diagnostic:
   ```cmd
   proctor-companion-1.0.0-setup.exe --verify-hardware
   ```

### Option B: Layered Safe Exam Browser (SEB) Lockdown
1. Download and install **Safe Exam Browser 3.5+ for Windows** from [safeexambrowser.org](https://safeexambrowser.org).
2. Download the official KLE Tech config profile: `aura-exam-lockdown.seb`.
3. Double-click `aura-exam-lockdown.seb`.
4. Safe Exam Browser will automatically lock down the Windows desktop, terminate prohibited background processes (Discord, TeamViewer, AnyDesk), and launch the secure exam portal.

---

## 4. Pairing with Your Active Exam Session

Each exam attempt requires a unique, short-lived enrollment challenge token:

1. In your web browser, navigate to your scheduled exam and click **Enter Proctor Preflight**.
2. Note your **Single-Use Challenge Token** (valid for 300 seconds).
3. Connect the companion client using either:
   - **One-Click Protocol Launch**: Click the blue **"Launch Desktop Companion (aura-proctor://)"** button on your preflight screen.
   - **Command Line Pairing**:
     ```cmd
     proctor-companion-1.0.0-setup.exe --server "http://127.0.0.1:3000" --attemptId "<YOUR-ATTEMPT-UUID>" --session-token "<CHALLENGE-TOKEN>"
     ```
4. The web dashboard will turn green with **`PROCTOR_READY`** once connected.

---

## 5. Camera, Microphone & Biometric Preflight

1. **Camera Position**: Center your face within the visible green bounding box on screen.
2. **Lighting**: Ensure your face is evenly illuminated with no strong backlighting or glare.
3. **Reference Photo**: Capture your baseline session photo. This is attached to your audit dossier and continuously checked for face continuity.
4. **Head Pose & Gaze**: Keep your head facing forward towards the screen. Looking away (> 35° yaw or pitch) for prolonged periods will trigger integrity review flags.
5. **Microphone**: Select your primary microphone in the preflight selector, speak to test the VU level meter, and verify ambient silence.

---

## 6. Prohibited Actions During Examination

- **Multiple Persons**: Only one candidate may be present in the camera view at any time. Multiple faces trigger an immediate high-severity incident.
- **Switching Windows / Applications**: Pressing `Alt+Tab`, `Ctrl+C`, `Ctrl+V`, or minimizing the exam window logs an integrity violation.
- **Multiple Displays**: Disconnect all external secondary monitors before starting.
- **Audio Disturbance**: Do not play media, take phone calls, or speak to third parties.

---

## 7. Support & Troubleshooting

If you encounter an issue during preflight or your exam session:
- **Webcam Access Error**: Open Windows *Settings > Privacy & security > Camera* and enable *"Let desktop apps access your camera"*.
- **Microphone Level Flat**: Test microphone input in Windows *Sound Settings* and select the active microphone in the preflight dropdown.
- **Token Expired**: Click **"Regenerate Challenge Token"** on the preflight panel to receive a fresh 300-second token.
- **COE Helpdesk**: Contact university examination support at `coe-support@example.invalid`.
