"""AURA LAB_07. Run with Python using the assignment environment."""

from typing import TypedDict
from langgraph.graph import StateGraph, START, END

class State(TypedDict, total=False):
    source: str
    route: str
    draft: str

def inspect(state):
    return {"route": "draft" if state["source"].strip() else "reject"}

def draft(state):
    return {"draft": f"Explain: {state['source']}"}

def reject(state):
    return {"draft": ""}

builder = StateGraph(State)
for node in (inspect, draft, reject):
    builder.add_node(node.__name__, node)
builder.add_edge(START, "inspect")
builder.add_conditional_edges("inspect", lambda state: state["route"], {"draft": "draft", "reject": "reject"})
builder.add_edge("draft", END)
builder.add_edge("reject", END)
graph = builder.compile()

good = graph.invoke({"source": "server-authoritative timing"})
bad = graph.invoke({"source": " "})
print(good, bad)

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

check(good["draft"].endswith("timing"), "Draft route")
check(bad["route"] == "reject" and bad["draft"] == "", "Missing evidence route")
