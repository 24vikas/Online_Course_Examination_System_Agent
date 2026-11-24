"""AURA LAB_06. Run with Python using the assignment environment."""

from dataclasses import dataclass
import shutil
import subprocess

@dataclass(frozen=True)
class Action:
    kind: str
    course: str

def dispatch(action, fixtures):
    if action.kind != "read_public_outcome":
        raise PermissionError("Action outside educational allowlist")
    return fixtures[action.course]
def isolated_probe():
    binary = shutil.which("bwrap")
    if not binary:
        return None
    argv = [binary, "--unshare-all", "--die-with-parent", "--clearenv",
            "--ro-bind", "/usr", "/usr", "--symlink", "usr/lib", "/lib",
            "--symlink", "usr/lib64", "/lib64", "--proc", "/proc",
            "--dev", "/dev", "--tmpfs", "/tmp"]
    probe = (
        "from pathlib import Path; import os; "
        "print('home mounted:', Path('/home').exists()); "
        "print('usr writable:', os.access('/usr', os.W_OK)); "
        "print('scratch mounted:', Path('/tmp').is_dir())"
    )
    return subprocess.run(argv + ["--", "/usr/bin/python3", "-I", "-c", probe],
                          capture_output=True, text=True, timeout=5)

fixtures = {"SYN101": "Design a bounded workflow"}
print(dispatch(Action("read_public_outcome", "SYN101"), fixtures))
print("BLOCKED: official OpenCLA runtime acceptance. Bubblewrap demonstration is independent.")
probe = isolated_probe()
if probe is None or probe.returncode:
    print("BLOCKED: Bubblewrap executable or namespace support unavailable.")
else:
    print(probe.stdout.strip())

def check(condition, label):
    assert condition, label
    print(f"PASS: {label}")

def raises(kind, operation):
    try:
        operation()
    except kind:
        print(f"PASS: rejected with {kind.__name__}")
    else:
        raise AssertionError(f"Expected {kind.__name__}")

if probe is not None and probe.returncode == 0:
    check("home mounted: False" in probe.stdout, "Host home omitted")
    check("usr writable: False" in probe.stdout, "System tree read-only")
    check("scratch mounted: True" in probe.stdout, "Isolated scratch available")
check(dispatch(Action("read_public_outcome", "SYN101"), fixtures) == fixtures["SYN101"], "Allowed lookup")
raises(PermissionError, lambda: dispatch(Action("write", "SYN101"), fixtures))
raises(KeyError, lambda: dispatch(Action("read_public_outcome", "absent"), fixtures))
