"""AURA LAB_09. Run with Python using the assignment environment."""

import hashlib
from urllib.request import Request, urlopen

SOURCES = {
    "Python AST": ("https://docs.python.org/3/library/ast.html", b"literal_eval"),
    "Python SQLite": ("https://docs.python.org/3/library/sqlite3.html", b"placeholder"),
}

def retrieve(name, source):
    url, marker = source
    with urlopen(Request(url, headers={"User-Agent": "AURA academic notebook"}), timeout=8) as response:
        contents = response.read(2_000_000)
        status = response.status
    if marker.lower() not in contents.lower():
        raise ValueError("Expected evidence marker absent")
    return name, url, status, marker.decode(), hashlib.sha256(contents).hexdigest()[:12]

evidence, unavailable = [], []
for name, source in SOURCES.items():
    try:
        evidence.append(retrieve(name, source))
    except (OSError, ValueError) as error:
        unavailable.append((name, type(error).__name__))
print("Source | URL | HTTP | Evidence marker | SHA-256 prefix")
for row in evidence:
    print(" | ".join(map(str, row)))
for name, error in unavailable:
    print("BLOCKED:", name, error)
if len(evidence) == 2:
    print("Synthesis: use AST for source inspection and SQLite placeholders for parameter binding.")

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

check(len(evidence) + len(unavailable) == len(SOURCES), "Every source has a recorded outcome")
check(all(row[2] == 200 for row in evidence), "Success entries contain HTTP evidence")
