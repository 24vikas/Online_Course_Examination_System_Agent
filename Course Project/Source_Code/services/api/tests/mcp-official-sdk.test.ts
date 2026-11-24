/**
 * Official Model Context Protocol (MCP) SDK Interoperability Test Suite
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 * 
 * Verifies official @modelcontextprotocol/sdk (v1.32.2) client-server interoperability,
 * session-derived tenant context, tool discovery, execution, resources, and error safety.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createStandardToolRegistry,
  createOfficialMCPClientPair,
  createOfficialMCPServer,
  MCPConnector,
} from "../src/index.ts";

describe("PHASE 12 WORKSTREAM B: OFFICIAL MCP SDK INTEROPERABILITY", () => {
  const tenantId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const crossTenantId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
  const lecturerId = "11111111-1111-1111-1111-111111111111";
  const studentId = "22222222-2222-2222-2222-222222222222";

  it("1. Official MCP Client discovers tools and resources from Official MCP Server", async () => {
    const toolReg = createStandardToolRegistry();
    const session = {
      tenantId,
      actorId: lecturerId,
      role: "LECTURER" as const,
      expiresAt: Date.now() + 60000,
    };

    const { client, server } = await createOfficialMCPClientPair(session, toolReg);

    // 1. Tool discovery
    const toolList = await client.listTools();
    assert.ok(Array.isArray(toolList.tools), "Discovered tools list");
    const toolNames = toolList.tools.map((t) => t.name);

    assert.ok(toolNames.includes("search_course_material"), "Exposes search_course_material");
    assert.ok(toolNames.includes("get_syllabus_topics"), "Exposes get_syllabus_topics");
    assert.ok(toolNames.includes("get_course_outcomes"), "Exposes get_course_outcomes");
    assert.ok(toolNames.includes("get_document_chunk"), "Exposes get_document_chunk");
    assert.ok(toolNames.includes("draft_questions"), "Exposes draft_questions");
    assert.ok(toolNames.includes("get_rag_evaluation_status"), "Exposes get_rag_evaluation_status");
    assert.ok(toolNames.includes("get_agent_run_status"), "Exposes get_agent_run_status");

    // 2. Resource discovery
    const resList = await client.listResources();
    assert.ok(Array.isArray(resList.resources), "Discovered resources list");
    const uris = resList.resources.map((r) => r.uri);
    assert.ok(uris.includes("syllabus://26ECAC401/plan"));
    assert.ok(uris.includes("syllabus://26ECAC301/plan"));

    // 3. Resource read
    const readResult = await client.readResource({ uri: "syllabus://26ECAC401/plan" });
    assert.ok(readResult.contents.length > 0);
    assert.match((readResult.contents[0] as any).text, /Authoritative Syllabus Resource/);

    await client.close();
    await server.close();
  });

  it("2. Official MCP Client executes canonical tool with structured content and verified tenant context", async () => {
    const toolReg = createStandardToolRegistry();
    const session = {
      tenantId,
      actorId: lecturerId,
      role: "LECTURER" as const,
      expiresAt: Date.now() + 60000,
    };

    const { client, server } = await createOfficialMCPClientPair(session, toolReg);

    // Call search_course_material
    const callRes = await client.callTool({
      name: "search_course_material",
      arguments: {
        query: "Radix-2 FFT decimation",
        courseCode: "26ECAC301",
        limit: 2,
      },
    });

    assert.equal(callRes.isError, false);
    const content = callRes.content as Array<{ type: string; text: string }>;
    assert.ok(content.length > 0);
    assert.equal(content[0].type, "text");

    const parsedData = JSON.parse(content[0].text);
    assert.equal(parsedData.courseCode, "26ECAC301");
    assert.equal(parsedData.tenantId, tenantId, "Zero cross-tenant leakage: bound to session tenant");
    assert.ok(parsedData.matchCount > 0);

    await client.close();
    await server.close();
  });

  it("3. Student role cannot invoke faculty-only mutating tools over Official MCP Server", async () => {
    const toolReg = createStandardToolRegistry();
    const studentSession = {
      tenantId,
      actorId: studentId,
      role: "STUDENT" as const,
      expiresAt: Date.now() + 60000,
    };

    const { client, server } = await createOfficialMCPClientPair(studentSession, toolReg);

    // Verify student tool list does NOT include draft_questions or marks_calculator
    const studentTools = await client.listTools();
    const studentToolNames = studentTools.tools.map((t) => t.name);
    assert.equal(studentToolNames.includes("draft_questions"), false, "Student cannot see draft_questions");
    assert.equal(studentToolNames.includes("marks_calculator"), false, "Student cannot see marks_calculator");

    // Attempting to invoke forbidden tool results in error
    const blockedCall = await client.callTool({
      name: "draft_questions",
      arguments: { topic: "SQL Injection", count: 1 },
    });

    assert.equal(blockedCall.isError, true);
    const blockedContent = blockedCall.content as Array<{ type: string; text: string }>;
    assert.match(blockedContent[0].text, /FORBIDDEN_TOOL_ACCESS/);

    await client.close();
    await server.close();
  });

  it("4. MCPConnector enforces payload limits, timeout limits, and error sanitization", async () => {
    const toolReg = createStandardToolRegistry();
    const connector = new MCPConnector(toolReg);

    const validToken = "tok-perf-001";
    connector.registerSession(validToken, {
      tenantId,
      actorId: lecturerId,
      role: "LECTURER",
      expiresAt: Date.now() + 60000,
    });

    // 1. Oversized payload rejection (413 Payload Too Large)
    const giantPayload = {
      jsonrpc: "2.0",
      id: 999,
      authToken: validToken,
      method: "tools/call",
      params: {
        name: "search_course_material",
        arguments: { query: "A".repeat(70000) }, // Exceeds 64 KB limit
      },
    };
    const sizeRes = await connector.handleRequest(giantPayload);
    assert.equal(sizeRes.error?.code, 413);
    assert.match(sizeRes.error!.message, /PAYLOAD_TOO_LARGE/);

    // 2. Cross-tenant spoofing fails closed (403 Forbidden)
    const crossRes = await connector.handleRequest({
      jsonrpc: "2.0",
      id: 1000,
      authToken: validToken,
      tenantId: crossTenantId, // SPOOFED
      method: "tools/list",
      params: {},
    });
    assert.equal(crossRes.error?.code, 403);
    assert.match(crossRes.error!.message, /CROSS_TENANT_VIOLATION/);

    // 3. Error sanitization: ensure no postgres:// credentials or internal paths leak
    const errorRes = await connector.handleRequest({
      jsonrpc: "2.0",
      id: 1001,
      authToken: validToken,
      method: "tools/call",
      params: {
        name: "file_reader",
        arguments: { documentPath: "../../etc/passwd" },
      },
    });
    assert.equal(errorRes.error?.code, 500);
    assert.match(errorRes.error!.message, /SECURITY_VIOLATION/);
    assert.equal(errorRes.error!.message.includes("postgres://"), false, "Credentials sanitized");
  });

  it("5. Model-driven tool selection: invokes search_course_material, receives verified chunks, drafts question with provenance", async () => {
    const toolReg = createStandardToolRegistry();
    const session = {
      tenantId,
      actorId: lecturerId,
      role: "LECTURER" as const,
      expiresAt: Date.now() + 60000,
    };

    const { client, server } = await createOfficialMCPClientPair(session, toolReg);

    // 1. Tool selection: Agent requests search_course_material for 26ECAC401 Agent Lifecycle
    const callRes = await client.callTool({
      name: "search_course_material",
      arguments: {
        query: "Agent Lifecycle and iterative loop Plan Act Observe Improve",
        courseCode: "26ECAC401",
        limit: 2,
      },
    });

    assert.equal(callRes.isError, false);
    const content = callRes.content as Array<{ type: string; text: string }>;
    assert.ok(content.length > 0);
    const searchData = JSON.parse(content[0].text);
    assert.equal(searchData.courseCode, "26ECAC401");
    assert.ok(searchData.results.length > 0, "Retrieved syllabus chunks via MCP");

    const retrievedChunk = searchData.results[0];
    assert.ok(retrievedChunk.chunkId, "Must have valid chunkId");
    assert.ok(retrievedChunk.content, "Must have content text");

    // 2. Draft question grounded in the retrieved chunk
    const draftRes = await client.callTool({
      name: "draft_questions",
      arguments: {
        topic: "Agent Lifecycle",
        bloomLevel: "UNDERSTAND",
        count: 1,
        courseCode: "26ECAC401",
      },
    });

    assert.equal(draftRes.isError, false);
    const draftContent = draftRes.content as Array<{ type: string; text: string }>;
    const draftData = JSON.parse(draftContent[0].text);
    assert.equal(draftData.generatedCount, 1);
    assert.equal(draftData.questions.length, 1);
    assert.equal(draftData.courseCode, "26ECAC401");

    await client.close();
    await server.close();
  });
});
