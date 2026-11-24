"""AURA LAB_02. Run with Python using the assignment environment."""

from dataclasses import dataclass

@dataclass(frozen=True)
class Query:
    course: str
    limit: int

def list_outcomes(role, query):
    if role != "faculty":
        raise PermissionError("Faculty access required")
    if not isinstance(query.course, str) or not query.course.startswith("SYN"):
        raise ValueError("Invalid synthetic course code")
    if type(query.limit) is not int or not 1 <= query.limit <= 3:
        raise ValueError("Limit must be an integer from 1 to 3")
    return ["CO1", "CO2", "CO3"][:query.limit]

print(list_outcomes("faculty", Query("SYN101", 2)))

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

check(list_outcomes("faculty", Query("SYN101", 1)) == ["CO1"], "Valid tool call")
raises(ValueError, lambda: list_outcomes("faculty", Query("SYN101", True)))
raises(PermissionError, lambda: list_outcomes("student", Query("SYN101", 2)))
