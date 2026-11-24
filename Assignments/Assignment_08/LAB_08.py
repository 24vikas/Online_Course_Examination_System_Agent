"""AURA LAB_08. Run with Python using the assignment environment."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor, wait
from threading import Event

def aggregate(specialists, timeout):
    results, failures = [], []
    with ThreadPoolExecutor(max_workers=len(specialists)) as pool:
        jobs = {pool.submit(fn): name for name, fn in specialists.items()}
        ready, late = wait(jobs, timeout=timeout)
        for job in ready:
            try:
                results.append(job.result())
            except ValueError:
                failures.append(jobs[job])
        failures.extend(jobs[job] for job in late)
    votes = Counter(results)
    majority = next((vote for vote, count in votes.items() if count > len(jobs)/2), None)
    return majority, sorted(failures)

def broken():
    raise ValueError("Specialist rejected its fixture")

# Deterministic test doubles. Slow workers must cooperate with their own deadline.
stop = Event()
def slow():
    stop.wait(0.25)
    return "review"
outcome = aggregate({"a": lambda: "draft", "b": lambda: "draft",
                     "error": broken, "late": slow}, 0.05)
print(outcome)

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

check(outcome == (None, ["error", "late"]), "Faults and insufficient quorum")
check(aggregate({"a": lambda: "draft", "b": lambda: "draft", "c": broken}, 1)[0]
      == "draft", "Majority survives one failure")
