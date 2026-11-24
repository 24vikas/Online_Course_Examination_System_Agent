"""Original executable AURA lab examples: implementation, demonstration and checks."""

EXAMPLES = {
1: '''
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
---
request = Request("SYN101", "find outcome")
print(chatbot(request))
print(agent(request, {"SYN101": "Explain deterministic grading"}.get))
---
check(agent(request, lambda course: "CO1")["complete"], "Goal completion")
check(not agent(request, lambda course: None)["complete"], "Missing evidence")
raises(ValueError, lambda: agent(Request("SYN101", "release"), dict().get))
''',
2: '''
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
---
print(list_outcomes("faculty", Query("SYN101", 2)))
---
check(list_outcomes("faculty", Query("SYN101", 1)) == ["CO1"], "Valid tool call")
raises(ValueError, lambda: list_outcomes("faculty", Query("SYN101", True)))
raises(PermissionError, lambda: list_outcomes("student", Query("SYN101", 2)))
''',
3: '''
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
---
loads = []
def instructions():
    loads.append("rubric")
    return "Compare each criterion with cited evidence."
registry = {"rubric": Skill("faculty", "Review a rubric", instructions)}
print({key: skill.summary for key, skill in registry.items()})
---
check(loads == [], "Discovery does not load instructions")
raises(PermissionError, lambda: disclose(registry, "rubric", "student"))
check(loads == [], "Denied access does not load instructions")
print(disclose(registry, "rubric", "faculty"))
check(loads == ["rubric"], "Lazy authorized loading")
''',
4: '''
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
---
memory = deque(maxlen=2)
memory.extend(["old", "question", "feedback"])
with tempfile.TemporaryDirectory() as directory:
    store = Path(directory) / "memory.json"
    store.write_text(json.dumps(["schema validation", "vector memory retrieval"]))
    ranked = retrieve(store, "vector retrieval")
print(list(memory), ranked)
---
check(list(memory) == ["question", "feedback"], "Bounded working memory")
check(ranked[0] == "vector memory retrieval", "Sparse vector retrieval")
check(cosine("", "vector") == 0, "Empty vector handling")
''',
5: '''
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

SERVER = """
from mcp.server.fastmcp import FastMCP
server = FastMCP("AURA Outcomes")
@server.tool()
def outcome(index: int) -> str:
    if index < 1:
        raise ValueError("Positive index required")
    return f"CO{index}"
if __name__ == "__main__":
    server.run(transport="stdio")
"""

async def exchange(path):
    async with stdio_client(StdioServerParameters(command=sys.executable, args=[str(path)])) as streams:
        async with ClientSession(*streams) as session:
            await session.initialize()
            tools = await session.list_tools()
            ok = await session.call_tool("outcome", {"index": 2})
            invalid = await session.call_tool("outcome", {"index": "bad"})
            return tools, ok, invalid
---
with TemporaryDirectory() as directory:
    path = Path(directory) / "server.py"
    path.write_text(SERVER)
    tool_list, result, rejected = await exchange(path)
print(result.content[0].text, "invalid arguments rejected:", rejected.isError)
---
check(tool_list.tools[0].inputSchema["properties"]["index"]["type"] == "integer", "Discovered schema")
check(not result.isError and result.content[0].text == "CO2", "Real MCP stdio response")
check(rejected.isError, "Invalid input rejected by SDK")
''',
6: '''
from dataclasses import dataclass

@dataclass(frozen=True)
class Action:
    kind: str
    course: str

def dispatch(action, fixtures):
    if action.kind != "read_public_outcome":
        raise PermissionError("Action outside educational allowlist")
    return fixtures[action.course]
---
fixtures = {"SYN101": "Design a bounded workflow"}
print(dispatch(Action("read_public_outcome", "SYN101"), fixtures))
print("BLOCKED: official OpenCLA runtime acceptance. Educational dispatcher only.")
---
check(dispatch(Action("read_public_outcome", "SYN101"), fixtures) == fixtures["SYN101"], "Allowed lookup")
raises(PermissionError, lambda: dispatch(Action("write", "SYN101"), fixtures))
raises(KeyError, lambda: dispatch(Action("read_public_outcome", "absent"), fixtures))
''',
7: '''
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
---
good = graph.invoke({"source": "server-authoritative timing"})
bad = graph.invoke({"source": " "})
print(good, bad)
---
check(good["draft"].endswith("timing"), "Draft route")
check(bad["route"] == "reject" and bad["draft"] == "", "Missing evidence route")
''',
8: '''
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
---
# Deterministic test doubles. Slow workers must cooperate with their own deadline.
stop = Event()
def slow():
    stop.wait(0.25)
    return "review"
outcome = aggregate({"a": lambda: "draft", "b": lambda: "draft",
                     "error": broken, "late": slow}, 0.05)
print(outcome)
---
check(outcome == (None, ["error", "late"]), "Faults and insufficient quorum")
check(aggregate({"a": lambda: "draft", "b": lambda: "draft", "c": broken}, 1)[0]
      == "draft", "Majority survives one failure")
''',
9: '''
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
---
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
---
check(len(evidence) + len(unavailable) == len(SOURCES), "Every source has a recorded outcome")
check(all(row[2] == 200 for row in evidence), "Success entries contain HTTP evidence")
''',
10: '''
from dataclasses import dataclass

@dataclass(frozen=True)
class Proposal:
    action: str
    justification: str

def diagnose(queue_depth):
    return Proposal("preview_scale", "Synthetic backlog exceeds threshold") if queue_depth > 50 else None

def apply_preview(proposal, approved):
    if not approved or proposal.action != "preview_scale":
        raise PermissionError("Approved preview action required")
    return {"dry_run": True, "replicas": 2}
---
proposal = diagnose(72)
print(proposal, apply_preview(proposal, approved=True))
---
check(diagnose(5) is None, "Healthy queue needs no proposal")
raises(PermissionError, lambda: apply_preview(proposal, False))
raises(PermissionError, lambda: apply_preview(Proposal("delete", "fixture"), True))
check(apply_preview(proposal, True)["dry_run"], "No cloud mutation")
''',
11: '''
from pathlib import Path
from tempfile import TemporaryDirectory
import subprocess
import sys

def run_factory(directory):
    requirement = "Clamp a score within zero and the maximum."
    plan = ["implement pure function", "test normal and boundary scores", "review test status"]
    source = "def clamp(score, maximum):\\n    return min(max(score, 0), maximum)\\n"
    (directory / "score.py").write_text(source)
    tests = ("from score import clamp\\n"
             "assert clamp(4, 10) == 4\\nassert clamp(-1, 10) == 0\\n"
             "assert clamp(14, 10) == 10\\nprint('3 score checks passed')\\n")
    (directory / "verify.py").write_text(tests)
    result = subprocess.run([sys.executable, "verify.py"], cwd=directory,
                            timeout=5, capture_output=True, text=True)
    return requirement, plan, result
---
with TemporaryDirectory() as directory:
    requirement, plan, result = run_factory(Path(directory))
print(requirement, plan, result.stdout.strip(), sep="\\n")
---
check(result.returncode == 0, "Actual subprocess test result")
check("3 score checks passed" in result.stdout, "Expected boundary test transcript")
''',
12: '''
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
---
policy = Policy()
outcomes = [policy.decide("faculty", "draft"), policy.decide("faculty", "publish", True),
            policy.decide("coe", "publish"), policy.decide("coe", "publish", True)]
print(outcomes, "audit entries:", len(policy.records()))
---
check(outcomes == [True, False, False, True], "Role and review gates")
check(policy.records()[1][-2] == policy.records()[0][-1], "Linked audit digests")
check(not policy.decide("coe", "unknown", True), "Unknown actions denied")
''',
13: '''
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
---
corpus = {"timing": ("Use the authoritative server clock.", "SYN-SYLLABUS §1", "CO2")}
draft, review = assess("timing", corpus, lambda item: "accept" if item.citation else "revise")
print(draft, review)
---
check(draft.state == "DRAFT" and review["reviewed"], "Review does not change academic state")
raises(LookupError, lambda: assess("unknown", corpus, lambda _: "accept"))
check(not assess("timing", corpus, lambda _: "revise")[1]["reviewed"], "Revision feedback")
''',
14: '''
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
---
valid = 'def score():\\n    """Return the deterministic score."""\\n    return 1'
invalid = "def score():\\n    try:\\n        return 1\\n    except:\\n        return 0"
print(analyze(valid), analyze(invalid))
---
check(analyze(valid) == [], "Documented valid program")
check({f.criterion for f in analyze(invalid)} ==
      {"explicit_exception_type", "function_documentation"}, "Two rubric findings")
check(analyze("def (")[0].criterion == "syntax", "Syntax error maps to rubric")
''',
}
