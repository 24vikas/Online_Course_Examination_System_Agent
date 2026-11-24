"""AURA LAB_03. Run with Python using the assignment environment."""

from dataclasses import dataclass
from typing import Callable

@dataclass(frozen=True)
class Skill:
    role: str
    summary: str
    load: Callable[[], str]

def disclose(registry, name, role):
    skill = registry[name]
    if role != skill.role:
        raise PermissionError("Skill unavailable for role")
    return skill.load()

loads = []
def instructions():
    loads.append("rubric")
    return "Compare each criterion with cited evidence."
registry = {"rubric": Skill("faculty", "Review a rubric", instructions)}
print({key: skill.summary for key, skill in registry.items()})

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

check(loads == [], "Discovery does not load instructions")
raises(PermissionError, lambda: disclose(registry, "rubric", "student"))
check(loads == [], "Denied access does not load instructions")
print(disclose(registry, "rubric", "faculty"))
check(loads == ["rubric"], "Lazy authorized loading")
