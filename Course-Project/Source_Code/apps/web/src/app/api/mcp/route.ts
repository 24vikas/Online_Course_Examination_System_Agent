/**
 * Model Context Protocol (MCP) Standard HTTP JSON-RPC 2.0 Endpoint
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "../../../lib/auth";
import { logEvent } from "../../../lib/logger";
import { createStandardToolRegistry, MCPConnector } from "@exam-system/api";

export const dynamic = "force-dynamic";

const toolRegistry = createStandardToolRegistry();
const mcpConnector = new MCPConnector(toolRegistry);

export async function GET(req: NextRequest) {
  return NextResponse.json({
    status: "ACTIVE",
    service: "aura-mcp-server",
    protocolVersion: mcpConnector.protocolVersion,
    serverInfo: mcpConnector.serverInfo,
    supportedMethods: [
      "initialize",
      "tools/list",
      "tools/call",
      "resources/list",
      "resources/read",
    ],
    supportedTransports: ["HTTP POST JSON-RPC 2.0"],
  });
}

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json();

    // 1. Resolve Auth Context from Bearer Token or Session Header
    const auth = await resolveAuth(req);

    // If client provided token in request body or headers, register session with connector
    const authToken =
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
      rawBody.authToken ||
      rawBody.params?.authToken ||
      rawBody.params?._meta?.authToken ||
      "anonymous-unauthenticated";

    if (auth) {
      mcpConnector.registerSession(authToken, {
        tenantId: auth.tenantId,
        actorId: auth.userId,
        role: auth.role as any,
        expiresAt: Date.now() + 1000 * 60 * 60, // 1 hour
      });
    }

    // Attach authToken to request body if missing
    if (!rawBody.authToken && authToken) {
      rawBody.authToken = authToken;
    }

    // 2. Dispatch to MCP Connector
    const response = await mcpConnector.handleRequest(rawBody);

    const isError = !response.success && response.error !== undefined;
    const statusCode = isError && response.error?.code && response.error.code >= 400 && response.error.code < 600
      ? response.error.code
      : 200;

    logEvent("info", "MCP JSON-RPC request handled", {
      method: rawBody.method,
      success: !isError,
      tenantId: auth?.tenantId,
      actorRole: auth?.role,
    });

    return NextResponse.json(response, { status: statusCode });
  } catch (err: any) {
    logEvent("error", "MCP handler unexpected error", { error: err.message });
    return NextResponse.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: 500,
          message: err.message || "INTERNAL_MCP_ERROR",
        },
      },
      { status: 500 }
    );
  }
}
