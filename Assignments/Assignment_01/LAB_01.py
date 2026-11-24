"""AURA LAB_01. Run with Python using the assignment environment."""

from dataclasses import dataclass

@dataclass(frozen=True)
class Request:
    course: str
    goal: str

def chatbot(request):
    return f"Ask your coordinator about {request.course}."

def agent(request, lookup):
    if request.goal != "find outcome":
        raise ValueError("Unsupported goal")
    outcome = lookup(request.course)
    return {"action": "lookup", "outcome": outcome, "complete": outcome is not None}

request = Request("SYN101", "find outcome")
print(chatbot(request))
print(agent(request, {"SYN101": "Explain deterministic grading"}.get))

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

check(agent(request, lambda course: "CO1")["complete"], "Goal completion")
check(not agent(request, lambda course: None)["complete"], "Missing evidence")
raises(ValueError, lambda: agent(Request("SYN101", "release"), dict().get))
