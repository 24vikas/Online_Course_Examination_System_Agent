"""AURA LAB_05. Run with Python using the assignment environment."""

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

import asyncio

with TemporaryDirectory() as directory:
    path = Path(directory) / "server.py"
    path.write_text(SERVER)
    tool_list, result, rejected = asyncio.run(exchange(path))
print(result.content[0].text, "invalid arguments rejected:", rejected.isError)

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

check(tool_list.tools[0].inputSchema["properties"]["index"]["type"] == "integer", "Discovered schema")
check(not result.isError and result.content[0].text == "CO2", "Real MCP stdio response")
check(rejected.isError, "Invalid input rejected by SDK")
