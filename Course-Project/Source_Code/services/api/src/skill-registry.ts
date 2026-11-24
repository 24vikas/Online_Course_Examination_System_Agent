/**
 * Skill Registry (L3 Skill Creation & Portable SKILL.md Standard)
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team 5: Team AURA
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { z } from "zod";
import type { SkillDefinition, AgentRiskLevel } from "@exam-system/contracts";
import type { ToolExecutionContext } from "./tool-registry.ts";
import { ToolRegistry } from "./tool-registry.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SkillExecutionContext extends ToolExecutionContext {
  toolRegistry: ToolRegistry;
}

export interface SkillExecutionResult<T = any> {
  success: boolean;
  skillName: string;
  version: string;
  data?: T;
  error?: string;
  toolsInvoked: string[];
  durationMs: number;
}

export interface SkillAuditEvent {
  eventType: "AUDIT_SKILL_EXECUTION";
  tenantId: string;
  actorId: string;
  actorRole: string;
  skillName: string;
  version: string;
  riskLevel: AgentRiskLevel;
  toolsInvoked: string[];
  status: "SUCCESS" | "FAILED" | "SECURITY_BLOCKED";
  durationMs: number;
  error?: string;
  timestamp: string;
}

export interface ExecutableSkill<TInput = any, TOutput = any> {
  definition: SkillDefinition & { riskLevel?: AgentRiskLevel };
  inputSchema: z.ZodType<TInput>;
  instructions?: string;
  execute(input: TInput, ctx: SkillExecutionContext): Promise<TOutput>;
}

// ==========================================
// FORMAL AGENT SKILL FRONTMATTER SCHEMA (L3 / GATE D)
// ==========================================

export const SkillFrontmatterSchema = z.object({
  name: z
    .string()
    .min(1, "Skill name is required")
    .max(64, "Skill name must not exceed 64 characters")
    .regex(/^[a-z0-9_-]+$/i, "Skill name must be alphanumeric with dashes or underscores"),
  description: z
    .string()
    .min(5, "Skill description must be at least 5 characters")
    .max(1024, "Skill description must not exceed 1024 characters"),
  version: z.string().default("1.0.0"),
  "allowed-tools": z.array(z.string()).default([]),
  tools: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  riskLevel: z.enum(["LOW", "REVERSIBLE", "HIGH_RISK", "PROHIBITED", "MEDIUM", "HIGH"]).default("LOW"),
  owner: z.string().optional(),
});

export type SkillFrontmatter = z.infer<typeof SkillFrontmatterSchema>;

// ==========================================
// SAFE PATH RESOLUTION & TRAVERSAL DEFENSE
// ==========================================

export function resolveSafeSkillPath(baseDir: string, relativePath: string): string {
  if (relativePath.includes("\0")) {
    throw new Error("PATH_TRAVERSAL_DETECTED: Null byte detected in path");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error("PATH_TRAVERSAL_DETECTED: Absolute paths are forbidden");
  }

  const normalized = path.normalize(relativePath);
  if (
    normalized === ".." ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized.includes(`${path.sep}..${path.sep}`) ||
    normalized.endsWith(`${path.sep}..`)
  ) {
    throw new Error("PATH_TRAVERSAL_DETECTED: Directory traversal ('..') is strictly forbidden");
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, normalized);

  if (!resolvedTarget.startsWith(resolvedBase + path.sep) && resolvedTarget !== resolvedBase) {
    throw new Error("PATH_TRAVERSAL_DETECTED: Target path escapes allowed base directory");
  }

  if (fs.existsSync(resolvedTarget)) {
    const realTarget = fs.realpathSync(resolvedTarget);
    const realBase = fs.realpathSync(resolvedBase);
    if (!realTarget.startsWith(realBase + path.sep) && realTarget !== realBase) {
      throw new Error("PATH_TRAVERSAL_DETECTED: Symlink traversal escapes base directory");
    }
  }

  return resolvedTarget;
}

// ==========================================
// PARSE & VALIDATE SKILL MARKDOWN
// ==========================================

export function parseSkillMarkdown(fileContent: string): {
  frontmatter: SkillFrontmatter;
  body: string;
  rawYaml: string;
} {
  const match = fileContent.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error("MALFORMED_FRONTMATTER: Missing YAML frontmatter delimiters ('---')");
  }

  const rawYaml = match[1];
  const body = match[2].trim();
  const rawFrontmatter: Record<string, any> = {};

  let currentKey = "";
  let inList = false;
  let inNestedObj = false;

  for (const line of rawYaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    if (trimmed.startsWith("- ") && inList) {
      if (Array.isArray(rawFrontmatter[currentKey])) {
        rawFrontmatter[currentKey].push(trimmed.slice(2).trim().replace(/^["']|["']$/g, ""));
      }
      continue;
    }

    // Check for nested indentation (2 spaces) under a parent key
    if ((line.startsWith("  ") || line.startsWith("\t")) && inNestedObj && currentKey) {
      const nestedColonIdx = trimmed.indexOf(":");
      if (nestedColonIdx !== -1) {
        const nKey = trimmed.slice(0, nestedColonIdx).trim();
        const nVal = trimmed.slice(nestedColonIdx + 1).trim().replace(/^["']|["']$/g, "");
        if (typeof rawFrontmatter[currentKey] === "object" && !Array.isArray(rawFrontmatter[currentKey])) {
          rawFrontmatter[currentKey][nKey] = nVal;
        }
      }
      continue;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx !== -1) {
      const key = line.slice(0, colonIdx).trim();
      const val = line.slice(colonIdx + 1).trim();

      if (val === "") {
        currentKey = key;
        // Check if next lines might be list or nested object based on convention
        if (key === "allowed-tools" || key === "tools") {
          inList = true;
          inNestedObj = false;
          rawFrontmatter[key] = [];
        } else {
          inList = false;
          inNestedObj = true;
          rawFrontmatter[key] = {};
        }
      } else {
        currentKey = key;
        inList = false;
        inNestedObj = false;
        rawFrontmatter[key] = val.replace(/^["']|["']$/g, "");
      }
    }
  }

  const parsed = SkillFrontmatterSchema.safeParse(rawFrontmatter);
  if (!parsed.success) {
    const errorDetails = parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ");
    throw new Error(`INVALID_FRONTMATTER: ${errorDetails}`);
  }

  return { frontmatter: parsed.data, body, rawYaml };
}

// ==========================================
// SKILL REGISTRY CLASS
// ==========================================

export class SkillRegistry {
  private skills = new Map<string, ExecutableSkill>();
  private skillInstructions = new Map<string, string>();
  private auditLog: SkillAuditEvent[] = [];
  private discoveryErrors = new Map<string, string>();

  registerSkill<TInput, TOutput>(skill: ExecutableSkill<TInput, TOutput>): void {
    if (this.skills.has(skill.definition.name)) {
      throw new Error(`SKILL_ALREADY_REGISTERED: Skill '${skill.definition.name}' already registered.`);
    }
    this.skills.set(skill.definition.name, skill);
    if (skill.instructions) {
      this.skillInstructions.set(skill.definition.name, skill.instructions);
    }
  }

  getSkill(name: string): ExecutableSkill | undefined {
    return this.skills.get(name);
  }

  /**
   * Progressive Disclosure (Level 1): Returns high-level metadata only
   * (name, description, required tools, riskLevel) without loading large markdown bodies into context.
   */
  listSkills(): SkillDefinition[] {
    return Array.from(this.skills.values()).map((s) => s.definition);
  }

  /**
   * Progressive Disclosure (Level 2): Activates and loads the full instruction body for a specific skill on demand.
   */
  getSkillInstructions(name: string): string | undefined {
    return this.skillInstructions.get(name);
  }

  getAuditLog(): SkillAuditEvent[] {
    return [...this.auditLog];
  }

  getDiscoveryErrors(): Map<string, string> {
    return new Map(this.discoveryErrors);
  }

  /**
   * Auto-discovers portable skills from filesystem `skills/` directory following the SKILL.md specification.
   * Dynamically loads any new skill folder without requiring source code modifications.
   */
  discoverFileSystemSkills(baseDir?: string): number {
    let searchPath = baseDir;
    if (!searchPath) {
      const candidates = [
        path.resolve(process.cwd(), "skills"),
        path.resolve(process.cwd(), "../skills"),
        path.resolve(process.cwd(), "../../skills"),
        path.resolve(__dirname, "../../../skills"),
      ];
      searchPath = candidates.find((p) => fs.existsSync(p)) || path.resolve(process.cwd(), "skills");
    }
    if (!fs.existsSync(searchPath)) {
      return 0;
    }

    let loadedCount = 0;
    const entries = fs.readdirSync(searchPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        try {
          const safeFolderPath = resolveSafeSkillPath(searchPath, entry.name);
          const skillFilePath = path.join(safeFolderPath, "SKILL.md");

          if (fs.existsSync(skillFilePath)) {
            const rawContent = fs.readFileSync(skillFilePath, "utf-8");
            const { frontmatter, body } = parseSkillMarkdown(rawContent);

            const name = frontmatter.name || entry.name;
            const version = frontmatter.version || "1.0.0";
            const description = frontmatter.description || "Portable Agent Skill";
            const allowedTools = frontmatter["allowed-tools"] || frontmatter.tools || [];
            const rawRisk = frontmatter.riskLevel || "LOW";
            const riskLevel: AgentRiskLevel =
              rawRisk === "HIGH"
                ? "HIGH_RISK"
                : rawRisk === "MEDIUM"
                ? "REVERSIBLE"
                : (rawRisk as AgentRiskLevel);

            if (!this.skills.has(name)) {
              this.registerSkill({
                definition: {
                  name,
                  version,
                  description,
                  requiredTools: allowedTools,
                  permissions: ["READ_SYLLABUS"],
                  owner: frontmatter.owner || frontmatter.metadata?.owner || "Team 5 (Team AURA)",
                  riskLevel,
                },
                instructions: body,
                inputSchema: z.record(z.any()),
                async execute(input, ctx) {
                  // Untrusted Instruction Boundary & Safety Guardrail:
                  // The instruction text is advisory prompt guidance for the LLM.
                  // It CANNOT grant privileges, alter RBAC, bypass OPA, or invoke tools
                  // outside the skill's declared allowedTools.
                  const toolsInvoked: string[] = [];
                  const toolResults: Record<string, any> = {};

                  // If input requests specific tools, verify against allowedTools
                  if (input.requestedTools && Array.isArray(input.requestedTools)) {
                    for (const requestedTool of input.requestedTools) {
                      if (!allowedTools.includes(requestedTool)) {
                        throw new Error(`UNAUTHORIZED_TOOL_REQUEST: Skill '${name}' does not permit tool '${requestedTool}'.`);
                      }
                    }
                  }

                  for (const toolName of allowedTools) {
                    const tool = ctx.toolRegistry.getTool(toolName);
                    if (tool && tool.requiredRoles.includes(ctx.actorRole)) {
                      toolsInvoked.push(toolName);
                      const res = await ctx.toolRegistry.invokeTool(toolName, input, ctx);
                      if (res.success) {
                        toolResults[toolName] = res.data;
                      }
                    }
                  }

                  return {
                    skillName: name,
                    version,
                    instructionsExcerpt: body.slice(0, 200),
                    toolsInvoked,
                    toolResults,
                    status: "EXECUTED_VIA_SKILL_SPEC",
                  };
                },
              });
              loadedCount++;
            }
          }
        } catch (err: any) {
          this.discoveryErrors.set(entry.name, err.message || String(err));
          console.warn(`[SkillRegistry] Failed to load skill from ${entry.name}:`, err.message || err);
        }
      }
    }

    return loadedCount;
  }

  async executeSkill(name: string, input: any, ctx: SkillExecutionContext): Promise<SkillExecutionResult> {
    const start = Date.now();
    const skill = this.skills.get(name);

    if (!skill) {
      const result: SkillExecutionResult = {
        success: false,
        skillName: name,
        version: "0.0.0",
        error: `SKILL_NOT_FOUND: Skill '${name}' is not registered in the skill catalog.`,
        toolsInvoked: [],
        durationMs: Date.now() - start,
      };

      this.auditLog.push({
        eventType: "AUDIT_SKILL_EXECUTION",
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        skillName: name,
        version: "0.0.0",
        riskLevel: "LOW",
        toolsInvoked: [],
        status: "FAILED",
        durationMs: result.durationMs,
        error: result.error,
        timestamp: new Date().toISOString(),
      });

      return result;
    }

    const riskLevel: AgentRiskLevel = skill.definition.riskLevel || "LOW";

    // Input schema validation
    const parsed = skill.inputSchema.safeParse(input);
    if (!parsed.success) {
      const errMsg = `INVALID_SKILL_INPUT: ${parsed.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ")}`;
      const result: SkillExecutionResult = {
        success: false,
        skillName: name,
        version: skill.definition.version,
        error: errMsg,
        toolsInvoked: [],
        durationMs: Date.now() - start,
      };

      this.auditLog.push({
        eventType: "AUDIT_SKILL_EXECUTION",
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        skillName: name,
        version: skill.definition.version,
        riskLevel,
        toolsInvoked: [],
        status: "FAILED",
        durationMs: result.durationMs,
        error: errMsg,
        timestamp: new Date().toISOString(),
      });

      return result;
    }

    try {
      const result = await skill.execute(parsed.data, ctx);
      const executionResult: SkillExecutionResult = {
        success: true,
        skillName: name,
        version: skill.definition.version,
        data: result,
        toolsInvoked: skill.definition.requiredTools,
        durationMs: Date.now() - start,
      };

      this.auditLog.push({
        eventType: "AUDIT_SKILL_EXECUTION",
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        skillName: name,
        version: skill.definition.version,
        riskLevel,
        toolsInvoked: skill.definition.requiredTools,
        status: "SUCCESS",
        durationMs: executionResult.durationMs,
        timestamp: new Date().toISOString(),
      });

      return executionResult;
    } catch (err: any) {
      const isSecurity = (err.message || "").includes("UNAUTHORIZED") || (err.message || "").includes("FORBIDDEN");
      const result: SkillExecutionResult = {
        success: false,
        skillName: name,
        version: skill.definition.version,
        error: `SKILL_EXECUTION_ERROR: ${err.message || String(err)}`,
        toolsInvoked: skill.definition.requiredTools,
        durationMs: Date.now() - start,
      };

      this.auditLog.push({
        eventType: "AUDIT_SKILL_EXECUTION",
        tenantId: ctx.tenantId,
        actorId: ctx.actorId,
        actorRole: ctx.actorRole,
        skillName: name,
        version: skill.definition.version,
        riskLevel,
        toolsInvoked: skill.definition.requiredTools,
        status: isSecurity ? "SECURITY_BLOCKED" : "FAILED",
        durationMs: result.durationMs,
        error: result.error,
        timestamp: new Date().toISOString(),
      });

      return result;
    }
  }
}

// ==========================================
// CANONICAL BUILT-IN SKILLS (L3 REQUIREMENT)
// ==========================================

export function createStandardSkillRegistry(): SkillRegistry {
  const registry = new SkillRegistry();

  // 1. Research-Summary Skill (L3 Built-in)
  registry.registerSkill({
    definition: {
      name: "research-summary",
      version: "1.0.0",
      description: "Extracts grounded syllabus passages, evaluates topic coverage, and creates cited evidence tables.",
      requiredTools: ["file_reader", "academic_api_caller"],
      permissions: ["READ_SYLLABUS", "READ_ACADEMIC_RECORDS"],
      owner: "Team 5 (Team AURA)",
    },
    inputSchema: z.object({
      courseOfferingId: z.string().uuid(),
      topicKeywords: z.array(z.string()).min(1),
    }),
    async execute(input, ctx) {
      // Step 1: Query Academic API
      const academicRes = await ctx.toolRegistry.invokeTool(
        "academic_api_caller",
        { endpoint: "getSyllabusTopics", courseOfferingId: input.courseOfferingId },
        ctx
      );
      if (!academicRes.success) throw new Error(academicRes.error);

      // Step 2: Read Syllabus Fixture
      const fileRes = await ctx.toolRegistry.invokeTool(
        "file_reader",
        { documentPath: "synthetic_dbms_syllabus.md" },
        ctx
      );
      if (!fileRes.success) throw new Error(fileRes.error);

      const syllabusText: string = fileRes.data.content;
      const matchedTopics = (academicRes.data.topics || []).filter((t: any) =>
        input.topicKeywords.some((kw) => t.title.toLowerCase().includes(kw.toLowerCase()))
      );

      return {
        courseOfferingId: input.courseOfferingId,
        matchedTopicCount: matchedTopics.length,
        topics: matchedTopics,
        evidenceExcerpt: syllabusText.slice(0, 300),
        citationLocator: `${fileRes.data.filename}#${fileRes.data.sha256.slice(0, 8)}`,
      };
    },
  });

  // 2. Code-Review Skill (CSE Discipline Static Analysis - L3 Built-in)
  registry.registerSkill({
    definition: {
      name: "code-review",
      version: "1.0.0",
      description: "Performs static syntax and structure analysis on submitted code; flags forbidden system calls without host execution.",
      requiredTools: ["marks_calculator"],
      permissions: ["STATIC_CODE_ANALYSIS"],
      owner: "Team 5 (Team AURA)",
    },
    inputSchema: z.object({
      submissionId: z.string(),
      sourceCode: z.string().min(5),
      language: z.enum(["sql", "python", "javascript"]),
      rubricMaxMarks: z.number().default(10),
    }),
    async execute(input, ctx) {
      const lines = input.sourceCode.split("\n");
      const findings: string[] = [];
      let deduction = 0;

      // Check for forbidden commands (Prohibited system actions)
      const prohibitedKeywords = ["exec", "eval", "shutdown", "drop database", "alter system", "__import__"];
      const lowerCode = input.sourceCode.toLowerCase();
      for (const kw of prohibitedKeywords) {
        if (lowerCode.includes(kw)) {
          findings.push(`SECURITY_FINDING: Prohibited command '${kw}' detected in code submission.`);
          deduction += 5;
        }
      }

      // Syntax checks
      if (input.language === "sql") {
        if (!lowerCode.includes("select") && !lowerCode.includes("create") && !lowerCode.includes("insert")) {
          findings.push("SYNTAX_WARNING: Expected core DDL/DML clauses not detected.");
          deduction += 2;
        }
      }

      const maxMarks = input.rubricMaxMarks ?? 10;
      const awardedMarks = Math.max(0, maxMarks - deduction);

      return {
        submissionId: input.submissionId,
        totalLines: lines.length,
        findings,
        maxMarks,
        suggestedMarks: awardedMarks,
        safeForEvaluation: deduction < 5,
      };
    },
  });

  // Auto-discover filesystem skills under skills/ directory
  registry.discoverFileSystemSkills();

  return registry;
}
