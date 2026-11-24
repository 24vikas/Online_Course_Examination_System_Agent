"""AURA LAB_12. Run with Python using the assignment environment."""

from dataclasses import dataclass, field
from hashlib import sha256
import json

@dataclass
class Policy:
    _records: list = field(default_factory=list)

    def decide(self, role, action, approved=False):
        risk = {"draft": 1, "publish": 8}.get(action, 10)
        outcome = (role == "faculty" and action == "draft") or (
            role == "coe" and action == "publish" and approved)
        previous = self._records[-1][-1] if self._records else "GENESIS"
        row = (role, action, risk, approved, outcome, previous)
        self._records.append((*row, sha256(json.dumps(row).encode()).hexdigest()))
        return outcome

    def records(self):
        return tuple(self._records)

policy = Policy()
outcomes = [policy.decide("faculty", "draft"), policy.decide("faculty", "publish", True),
            policy.decide("coe", "publish"), policy.decide("coe", "publish", True)]
print(outcomes, "audit entries:", len(policy.records()))

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

check(outcomes == [True, False, False, True], "Role and review gates")
check(policy.records()[1][-2] == policy.records()[0][-1], "Linked audit digests")
check(not policy.decide("coe", "unknown", True), "Unknown actions denied")
