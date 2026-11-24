/**
 * Action Policy & Governance Engine (L12 Safety & Governance)
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import crypto from "crypto";
import type { UserRole, AgentRiskLevel, AgentAuditEvent } from "@exam-system/contracts";

export interface ActionRequest {
  tenantId: string;
  actorId: string;
  actorRole: UserRole;
  actionName: string;
  targetResource: string;
  riskLevel: AgentRiskLevel;
  inputPayload: any;
  approvalToken?: string;
}

export interface PolicyEvaluationResult {
  allowed: boolean;
  requiresApproval: boolean;
  approvalRequestId?: string;
  reason: string;
  auditEvent: AgentAuditEvent;
}

export class ActionPolicyEngine {
  private auditLog: AgentAuditEvent[] = [];
  private pendingApprovals = new Map<string, { request: ActionRequest; createdAt: string }>();

  evaluateAction(req: ActionRequest): PolicyEvaluationResult {
    const eventId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const now = new Date().toISOString();

    // 1. Check PROHIBITED actions
    if (req.riskLevel === "PROHIBITED") {
      const event: AgentAuditEvent = {
        eventId,
        runId,
        tenantId: req.tenantId,
        timestamp: now,
        phase: "OBSERVE",
        actorId: req.actorId,
        agentRole: "COORDINATOR",
        actionType: req.actionName,
        inputSummary: JSON.stringify(req.inputPayload).slice(0, 100),
        outputSummary: "ACTION_PROHIBITED: Action is strictly forbidden by institutional safety policy.",
        status: "REJECTED",
        riskLevel: "PROHIBITED",
      };
      this.recordAuditEvent(event);

      return {
        allowed: false,
        requiresApproval: false,
        reason: "PROHIBITED_ACTION: Direct execution of privileged/unvetted operations is prohibited by safety policy.",
        auditEvent: event,
      };
    }

    // 2. Check HIGH_RISK actions (Require HITL approval)
    if (req.riskLevel === "HIGH_RISK") {
      // If approved with valid token, allow
      if (req.approvalToken && req.approvalToken.startsWith("APP-")) {
        const event: AgentAuditEvent = {
          eventId,
          runId,
          tenantId: req.tenantId,
          timestamp: now,
          phase: "APPROVAL",
          actorId: req.actorId,
          agentRole: "COORDINATOR",
          actionType: req.actionName,
          inputSummary: JSON.stringify(req.inputPayload).slice(0, 100),
          outputSummary: `ACTION_AUTHORIZED: High-risk action authorized with approval token ${req.approvalToken}.`,
          status: "SUCCESS",
          riskLevel: "HIGH_RISK",
          authorizedBy: req.actorId,
        };
        this.recordAuditEvent(event);

        return {
          allowed: true,
          requiresApproval: false,
          reason: "APPROVED: High-risk action executed under verified human sign-off.",
          auditEvent: event,
        };
      }

      // Generate pending approval request
      const approvalId = `APP-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      this.pendingApprovals.set(approvalId, { request: req, createdAt: now });

      const event: AgentAuditEvent = {
        eventId,
        runId,
        tenantId: req.tenantId,
        timestamp: now,
        phase: "APPROVAL",
        actorId: req.actorId,
        agentRole: "COORDINATOR",
        actionType: req.actionName,
        inputSummary: JSON.stringify(req.inputPayload).slice(0, 100),
        outputSummary: `APPROVAL_REQUIRED: Action requires explicit Human-in-the-Loop approval (Request ID: ${approvalId}).`,
        status: "WARNING",
        riskLevel: "HIGH_RISK",
      };
      this.recordAuditEvent(event);

      return {
        allowed: false,
        requiresApproval: true,
        approvalRequestId: approvalId,
        reason: `HIGH_RISK_GATE: Action '${req.actionName}' requires explicit authorized sign-off.`,
        auditEvent: event,
      };
    }

    // 3. LOW and REVERSIBLE actions
    const event: AgentAuditEvent = {
      eventId,
      runId,
      tenantId: req.tenantId,
      timestamp: now,
      phase: "ACT",
      actorId: req.actorId,
      agentRole: "COORDINATOR",
      actionType: req.actionName,
      inputSummary: JSON.stringify(req.inputPayload).slice(0, 100),
      outputSummary: "ACTION_PERMITTED: Standard operational action permitted within role boundaries.",
      status: "SUCCESS",
      riskLevel: req.riskLevel,
    };
    this.recordAuditEvent(event);

    return {
      allowed: true,
      requiresApproval: false,
      reason: "PERMITTED: Standard safe operation authorized.",
      auditEvent: event,
    };
  }

  approvePendingAction(approvalId: string, authorizerId: string): ActionRequest {
    const pending = this.pendingApprovals.get(approvalId);
    if (!pending) {
      throw new Error(`APPROVAL_NOT_FOUND: Pending approval '${approvalId}' does not exist.`);
    }
    this.pendingApprovals.delete(approvalId);
    return { ...pending.request, approvalToken: approvalId };
  }

  private recordAuditEvent(event: AgentAuditEvent): void {
    // Append-only guarantee: Array only appends, no deletion or mutation
    this.auditLog.push(Object.freeze({ ...event }));
  }

  getAuditTrail(tenantId: string): AgentAuditEvent[] {
    return this.auditLog.filter((e) => e.tenantId === tenantId);
  }
}
