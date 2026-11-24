"""AURA LAB_14. Run with Python using the assignment environment."""

import ast
from dataclasses import dataclass

@dataclass(frozen=True)
class Finding:
    criterion: str
    line: int

def analyze(source):
    try:
        tree = ast.parse(source)
    except SyntaxError as error:
        return [Finding("syntax", error.lineno or 1)]
    findings = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ExceptHandler) and node.type is None:
            findings.append(Finding("explicit_exception_type", node.lineno))
        if isinstance(node, ast.FunctionDef) and not ast.get_docstring(node):
            findings.append(Finding("function_documentation", node.lineno))
    return findings

valid = 'def score():\n    """Return the deterministic score."""\n    return 1'
invalid = "def score():\n    try:\n        return 1\n    except:\n        return 0"
print(analyze(valid), analyze(invalid))

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

check(analyze(valid) == [], "Documented valid program")
check({f.criterion for f in analyze(invalid)} ==
      {"explicit_exception_type", "function_documentation"}, "Two rubric findings")
check(analyze("def (")[0].criterion == "syntax", "Syntax error maps to rubric")
