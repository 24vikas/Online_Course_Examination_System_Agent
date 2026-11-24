"""AURA LAB_04. Run with Python using the assignment environment."""

from collections import Counter, deque
import json
from math import sqrt
from pathlib import Path
import tempfile

def cosine(a, b):
    x, y = Counter(a.lower().split()), Counter(b.lower().split())
    norm = sqrt(sum(v*v for v in x.values()) * sum(v*v for v in y.values()))
    return sum(v*y[k] for k, v in x.items()) / norm if norm else 0

def retrieve(path, query):
    records = json.loads(path.read_text())
    return sorted(records, key=lambda record: cosine(query, record), reverse=True)

memory = deque(maxlen=2)
memory.extend(["old", "question", "feedback"])
with tempfile.TemporaryDirectory() as directory:
    store = Path(directory) / "memory.json"
    store.write_text(json.dumps(["schema validation", "vector memory retrieval"]))
    ranked = retrieve(store, "vector retrieval")
print(list(memory), ranked)

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

check(list(memory) == ["question", "feedback"], "Bounded working memory")
check(ranked[0] == "vector memory retrieval", "Sparse vector retrieval")
check(cosine("", "vector") == 0, "Empty vector handling")
