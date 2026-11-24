"""AURA LAB_11. Run with Python using the assignment environment."""

from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys

def run_factory(directory):
    requirement = "Clamp a score within zero and the maximum."
    plan = ["implement pure function", "test normal and boundary scores", "review test status"]
    source = "def clamp(score, maximum):\n    return min(max(score, 0), maximum)\n"
    (directory / "score.py").write_text(source)
    tests = ("from score import clamp\n"
             "assert clamp(4, 10) == 4\nassert clamp(-1, 10) == 0\n"
             "assert clamp(14, 10) == 10\nprint('3 score checks passed')\n")
    (directory / "verify.py").write_text(tests)
    result = subprocess.run([sys.executable, "verify.py"], cwd=directory,
                            timeout=5, capture_output=True, text=True)
    return requirement, plan, result

with TemporaryDirectory() as directory:
    requirement, plan, result = run_factory(Path(directory))
print(requirement, plan, result.stdout.strip(), sep="\n")

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

check(result.returncode == 0, "Actual subprocess test result")
check("3 score checks passed" in result.stdout, "Expected boundary test transcript")
