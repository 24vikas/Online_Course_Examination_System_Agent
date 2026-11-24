/**
 * OpenCLA / OpenClaw Safe Runtime Simulator (L6 OpenCLA/OpenClaw Runtime)
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 * 
 * NOTE: As established in architectural decisions, OpenClaw is NOT permitted
 * to run arbitrary uncontained host commands. This module demonstrates the
 * canonical OpenCLA/OpenClaw runtime pattern (session lifecycle, allowlisted tools,
 * operational event logging, and approval gates) in a safe, sandboxed environment.
 */

import crypto from "crypto";
import type { UserRole, AgentRiskLevel } from "@exam-system/contracts";
import { ToolRegistry } from "./tool-registry.ts";

export interface OpenCLASession {
  sessionId: string;
  tenantId: string;
  actorId: string;
  role: UserRole;
  allowlistedTools: string[];
  state: "INITIALIZED" | "ACTIVE" | "PAUSED_FOR_APPROVAL" | "COMPLETED" | "TERMINATED";
  lifecycleLogs: { step: string; timestamp: string; details: string }[];
}

export class SafeOpenCLARuntime {
  private toolRegistry: ToolRegistry;
  private activeSessions = new Map<string, OpenCLASession>();

  constructor(toolRegistry: ToolRegistry) {
    this.toolRegistry = toolRegistry;
  }

  createSession(tenantId: string, actorId: string, role: UserRole, allowlistedTools: string[]): OpenCLASession {
    const sessionId = `opencla-${crypto.randomUUID()}`;
    const session: OpenCLASession = {
      sessionId,
      tenantId,
      actorId,
      role,
      allowlistedTools,
      state: "INITIALIZED",
      lifecycleLogs: [
        { step: "LIFECYCLE_INIT", timestamp: new Date().toISOString(), details: `OpenCLA session created for actor ${actorId}` },
      ],
    };

    this.activeSessions.set(sessionId, session);
    return session;
  }

  async executeRuntimeStep(sessionId: string, toolName: string, inputArgs: any): Promise<{ success: boolean; result?: any; error?: string }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { success: false, error: "SESSION_NOT_FOUND" };
    }

    if (session.state === "TERMINATED") {
      return { success: false, error: "SESSION_TERMINATED" };
    }

    session.state = "ACTIVE";
    session.lifecycleLogs.push({
      step: "ACTION_ATTEMPT",
      timestamp: new Date().toISOString(),
      details: `Attempting invocation of tool '${toolName}'`,
    });

    // Enforce tool allowlist
    if (!session.allowlistedTools.includes(toolName)) {
      const err = `SECURITY_VIOLATION: Tool '${toolName}' is not in session allowlist [${session.allowlistedTools.join(", ")}]`;
      session.lifecycleLogs.push({ step: "SECURITY_BLOCK", timestamp: new Date().toISOString(), details: err });
      return { success: false, error: err };
    }

    // Execute via ToolRegistry
    const execRes = await this.toolRegistry.invokeTool(toolName, inputArgs, {
      tenantId: session.tenantId,
      actorId: session.actorId,
      actorRole: session.role,
    });

    session.lifecycleLogs.push({
      step: "ACTION_RESULT",
      timestamp: new Date().toISOString(),
      details: execRes.success ? "Success" : `Failed: ${execRes.error}`,
    });

    return {
      success: execRes.success,
      result: execRes.data,
      error: execRes.error,
    };
  }

  terminateSession(sessionId: string): OpenCLASession {
    const session = this.activeSessions.get(sessionId);
    if (!session) throw new Error("SESSION_NOT_FOUND");
    session.state = "TERMINATED";
    session.lifecycleLogs.push({
      step: "LIFECYCLE_TERMINATE",
      timestamp: new Date().toISOString(),
      details: "Session terminated cleanly.",
    });
    return session;
  }

  getSession(sessionId: string): OpenCLASession | undefined {
    return this.activeSessions.get(sessionId);
  }
}
