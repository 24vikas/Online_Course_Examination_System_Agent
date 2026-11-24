"""AURA LAB_13. Run with Python using the assignment environment."""

from dataclasses import dataclass

@dataclass(frozen=True)
class Draft:
    citation: str
    question: str
    outcome: str
    state: str = "DRAFT"

def assess(topic, corpus, reviewer):
    if topic not in corpus:
        raise LookupError("Grounding absent")
    quote, citation, outcome = corpus[topic]
    draft = Draft(citation, f"Explain this principle: {quote}", outcome)
    feedback = reviewer(draft)
    return draft, {"reviewed": feedback == "accept", "feedback": feedback}

corpus = {"timing": ("Use the authoritative server clock.", "SYN-SYLLABUS §1", "CO2")}
draft, review = assess("timing", corpus, lambda item: "accept" if item.citation else "revise")
print(draft, review)

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

check(draft.state == "DRAFT" and review["reviewed"], "Review does not change academic state")
raises(LookupError, lambda: assess("unknown", corpus, lambda _: "accept"))
check(not assess("timing", corpus, lambda _: "revise")[1]["reviewed"], "Revision feedback")
