"""Build the notebooks from AURA academic records and execute each in a fresh kernel."""
import argparse
from importlib.metadata import version
from pathlib import Path
import platform
import re
from time import perf_counter

from jupyter_client import KernelManager
from nbclient import NotebookClient
import nbformat as nb

from examples import EXAMPLES

ROOT = Path(__file__).resolve().parents[2]
md, code = nb.v4.new_markdown_cell, nb.v4.new_code_cell
PACKAGES = ("nbformat", "nbclient", "ipykernel", "mcp", "langgraph")
FLOWS = [
    "select the lookup action; call the course lookup; decide whether the goal is complete",
    "check the caller role; validate the course and limit; return the permitted outcome slice",
    "list skill summaries; check the caller capability; lazily load instructions",
    "evict obsolete working memory; reopen the durable store; rank by sparse cosine similarity",
    "start the temporary stdio server; discover the tool schema; send valid and invalid requests",
    "classify the action; reject operations outside the allowlist; return the synthetic record",
    "validate the input state; route to draft or reject; inspect the terminal state",
    "dispatch bounded specialists; collect timely votes and failures; require a strict majority",
    "select two primary sources; retrieve and hash the evidence; synthesize when both sources respond",
    "observe synthetic backlog; propose a dry-run change; enforce the approval and action gates",
    "capture the score requirement; write a planned implementation and tests; review the subprocess result",
    "classify action risk; authorize by role and approval; append a hash-linked decision",
    "retrieve syllabus evidence; generate a cited draft; record reviewer feedback without publishing",
    "parse Python into an AST; map syntax or rubric findings; report the location of each finding",
]
HARNESS = """
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
""".strip()

def section(record, index):
    return re.search(rf"(?ms)^## {index}\..*?\n(.*?)(?=^## \d+\.|\Z)", record)[1].strip()

def build(number, record):
    title = record.splitlines()[0].split(": ", 1)[1].split(" *(")[0]
    outcome = next(line for line in record.splitlines() if line.startswith("**Course Outcome"))
    steps = FLOWS[number - 1].split("; ")
    algorithm = "\n".join(f"{i}. {step.capitalize()}." for i, step in enumerate(steps, 1))
    prerequisite = {5: "MCP SDK and a local Python child process", 7: "LangGraph", 9: "HTTPS to docs.python.org"}.get(number, "Python standard library")
    implementation, demo, checks = EXAMPLES[number].strip().split("\n---\n")
    diagram = "flowchart LR\n    Input --> Workflow --> Evidence --> Verification"
    cells = [
        md(f"# Lab {number:02d} — {title}\n\n"
           f"Agentic AI (26ECAC401) · KLE Technological University · Team 5 · Division 7\n\n{outcome}"),
        md("## Aim and problem statement\n\n" + section(record, 3)),
        md("## Learning objectives\n\n" + "\n".join(f"- {step.capitalize()}." for step in steps)),
        md("## Theory\n\n" + section(record, 6)),
        md(f"## Prerequisites\n\nPython {platform.python_version()} and {prerequisite}. Install the pinned notebook dependencies from the repository root.\n\n"
           f"## Architecture\n\nInput flows through the lab workflow to an observable result and executable checks.\n\n"
           f"```mermaid\n{diagram}\n```\n\n## Algorithm\n\n{algorithm}\n\n"
           f"```text\n" + "\n".join(step.upper() for step in steps) + "\n```"),
        md("## Python implementation"), code(implementation),
        md("## Execution"), code(demo),
        md("## Verification"), code(HARNESS + "\n\n" + checks),
        md("## Viva questions\n\n" + section(record, 22) + "\n\n## References\n\n" + section(record, 24)),
    ]
    return nb.v4.new_notebook(cells=cells, metadata={
        "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
    })

def main(records):
    environment = "Python " + platform.python_version() + " · " + ", ".join(f"{p} {version(p)}" for p in PACKAGES)
    report = ["# Notebook execution report", "", environment, "",
              "| Notebook | Code cells | Executed | Passed checks | Failures | Duration (s) | Integration limits | Status |",
              "|---|---:|---:|---:|---:|---:|---|---|"]
    failures = 0
    for number in EXAMPLES:
        name = f"LAB_{number:02d}"
        folder = f"Assignments/Assignment_{number:02d}" if number <= 12 else f"Assignments/Supplementary_Labs/Lab_{number}"
        path = ROOT / folder / f"{name}.ipynb"
        notebook = build(number, (records / f"{name}.md").read_text())
        nb.validate(notebook)
        started = perf_counter()
        NotebookClient(notebook, timeout=45, allow_errors=True, km=KernelManager(kernel_name="python3", transport="ipc")).execute()
        duration = perf_counter() - started
        cells = [c for c in notebook.cells if c.cell_type == "code"]
        errors = [o.ename for c in cells for o in c.outputs if o.output_type == "error"]
        executed = sum(c.execution_count is not None for c in cells)
        transcript = "".join(o.text for c in cells for o in c.outputs if o.output_type == "stream" and o.name == "stdout")
        tests = sum(line.startswith("PASS:") for line in transcript.splitlines())
        blocked = [line.removeprefix("BLOCKED: ") for line in transcript.splitlines() if line.startswith("BLOCKED: ")]
        status = "FAIL" if errors or not tests else "PARTIAL" if blocked else "PASS"
        failures += status == "FAIL"
        limits = "; ".join(blocked) or "None for the exercised scope"
        notebook.cells.insert(-1, md(
            f"## Output and observations\n\n{executed} code cells executed and {tests} checks passed. "
            f"Integration limits: {limits}.\n\n## Result\n\n**{status}**\n\n"
            f"## Conclusion\n\nThe experiment exercised how to {FLOWS[number - 1]}. "
            "The saved transcript describes this lab run. Production acceptance requires separate evidence."
        ))
        path.parent.mkdir(parents=True, exist_ok=True)
        if status != "FAIL":
            nb.write(notebook, path)
            saved = nb.read(path, as_version=4)
            nb.validate(saved)
            assert saved.cells == notebook.cells
        else:
            for cell in cells:
                for output in cell.outputs:
                    if output.output_type == "error":
                        print(name, output.ename, output.evalue)
        report.append(f"| [{name}](../{folder}/{name}.ipynb) | {len(cells)} | {executed} | {tests} | {len(errors)} | {duration:.2f} | {limits} | {status} |")
        print(name, status, flush=True)
    (ROOT / "Assignments/NOTEBOOK_EXECUTION_REPORT.md").write_text("\n".join(report) + "\n")
    return bool(failures)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("records", type=Path)
    raise SystemExit(main(parser.parse_args().records))
