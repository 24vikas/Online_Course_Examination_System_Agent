"""AURA LAB_10. Run with Python using the assignment environment."""

from dataclasses import dataclass

@dataclass(frozen=True)
class Proposal:
    action: str
    justification: str

def diagnose(queue_depth):
    return Proposal("preview_scale", "Synthetic backlog exceeds threshold") if queue_depth > 50 else None

def apply_preview(proposal, approved):
    if not approved or proposal.action != "preview_scale":
        raise PermissionError("Approved preview action required")
    return {"dry_run": True, "replicas": 2}

proposal = diagnose(72)
print(proposal, apply_preview(proposal, approved=True))

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

check(diagnose(5) is None, "Healthy queue needs no proposal")
raises(PermissionError, lambda: apply_preview(proposal, False))
raises(PermissionError, lambda: apply_preview(Proposal("delete", "fixture"), True))
check(apply_preview(proposal, True)["dry_run"], "No cloud mutation")
