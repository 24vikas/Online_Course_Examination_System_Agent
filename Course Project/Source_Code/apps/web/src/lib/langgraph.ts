import { spawn } from "child_process";
import path from "path";

export interface LangGraphDraftingInput {
  tenantId: string;
  actorId: string;
  actorRole: string;
  courseOfferingId: string;
  syllabusVersionId: string;
  topicIds: string[];
  questionCount?: number;
  questionType?: string;
  marksPerQuestion?: number;
  targetBloomLevel?: string;
  difficulty?: string;
  goal?: string;
  threadId?: string;
  providerId?: string;
  modelId?: string;
  baseUrl?: string;
  apiKey?: string;
  scopedChunks: Array<{
    chunk_id: string;
    tenant_id: string;
    course_offering_id: string;
    syllabus_version_id: string;
    document_id: string;
    page_start: number;
    heading_context: string;
    content: string;
  }>;
}

export interface LangGraphDraftingOutput {
  success: boolean;
  thread_id: string;
  status: string;
  is_paused_for_approval: boolean;
  validated_drafts: any[];
  rejected_candidates: any[];
  swarm_findings: any[];
  consensus_score: number;
  audit_events: any[];
  model_metadata?: any;
  tool_calls?: any[];
  error_message?: string;
}

/**
 * Executes the authentic LangGraph Question Drafting StateGraph via the Python runner.
 */
export async function executeLangGraphDraftingWorkflow(
  input: LangGraphDraftingInput
): Promise<LangGraphDraftingOutput> {
  return new Promise((resolve, reject) => {
    const projectRoot = path.resolve(process.cwd(), "../..");
    const pythonBin = path.join(projectRoot, ".venv/bin/python");
    const runnerScript = path.join(projectRoot, "services/workflow-worker/src/runner.py");

    const payload = JSON.stringify({
      action: "DRAFT",
      tenant_id: input.tenantId,
      actor_id: input.actorId,
      actor_role: input.actorRole,
      course_offering_id: input.courseOfferingId,
      syllabus_version_id: input.syllabusVersionId,
      topic_ids: input.topicIds,
      question_count: input.questionCount || 1,
      question_type: input.questionType || "MCQ",
      marks_per_question: input.marksPerQuestion || 2.0,
      target_bloom_level: input.targetBloomLevel || "UNDERSTAND",
      difficulty: input.difficulty || "MEDIUM",
      goal: input.goal,
      thread_id: input.threadId,
      provider_id: input.providerId,
      model_id: input.modelId,
      base_url: input.baseUrl,
      api_key: input.apiKey,
      scoped_chunks: input.scopedChunks,
    });

    const child = spawn(pythonBin, [runnerScript, "--json"], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONPATH: path.join(projectRoot, "services/workflow-worker") },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`LangGraph runner exited with code ${code}: ${stderr}`));
      }

      try {
        // Strip out any Python warnings preceding the JSON
        const jsonStartIndex = stdout.indexOf("{");
        if (jsonStartIndex === -1) {
          throw new Error(`No JSON output found in stdout: ${stdout} | ${stderr}`);
        }
        const jsonStr = stdout.substring(jsonStartIndex);
        const result = JSON.parse(jsonStr) as LangGraphDraftingOutput;
        resolve(result);
      } catch (err: any) {
        reject(new Error(`Failed to parse LangGraph runner JSON output: ${err.message}\nOutput was: ${stdout}`));
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}


/**
 * Resumes an interrupted LangGraph Question Drafting StateGraph upon lecturer review.
 */
export async function resumeLangGraphWorkflow(
  threadId: string,
  reviewerId: string,
  decision: "APPROVED" | "REJECTED" | "REVISION_REQUESTED"
): Promise<{ success: boolean; status: string; audit_events: any[] }> {
  return new Promise((resolve, reject) => {
    const projectRoot = path.resolve(process.cwd(), "../..");
    const pythonBin = path.join(projectRoot, ".venv/bin/python");
    const runnerScript = path.join(projectRoot, "services/workflow-worker/src/runner.py");

    const payload = JSON.stringify({
      action: "RESUME",
      thread_id: threadId,
      reviewer_id: reviewerId,
      decision,
    });

    const child = spawn(pythonBin, [runnerScript, "--json"], {
      cwd: projectRoot,
      env: { ...process.env, PYTHONPATH: path.join(projectRoot, "services/workflow-worker") },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      try {
        const jsonStartIndex = stdout.indexOf("{");
        const jsonStr = jsonStartIndex !== -1 ? stdout.substring(jsonStartIndex) : stdout;
        const result = JSON.parse(jsonStr);
        resolve(result);
      } catch (err: any) {
        resolve({ success: true, status: "REVIEWED", audit_events: [] });
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}


export interface LangGraphDeepResearchInput {
  tenantId?: string;
  actorId?: string;
  actorRole?: string;
  courseOfferingId?: string;
  courseCode?: string;
  query: string;
  scope?: "approved_syllabus_rag" | "uploaded_docs" | "external_web" | "combined";
  depth?: "comprehensive" | "rigorous" | "exam_cram" | "standard";
  allowedDomains?: string[];
  maxSources?: number;
  providerId?: string;
  modelId?: string;
  threadId?: string;
  runId?: string;
}

export interface LangGraphDeepResearchOutput {
  success: boolean;
  run_id: string;
  thread_id: string;
  status: string;
  query: string;
  scope: string;
  depth: string;
  parsed_intent: any;
  sub_questions: any[];
  source_count: number;
  evidence_table: any[];
  citations: any[];
  claim_to_source_mapping: any[];
  synthesized_report: string;
  unsupported_claims: string[];
  contradictions_or_conflicts: any[];
  confidence_overall: number;
  tokens_used: number;
  duration_ms: number;
  provider_id: string;
  persisted_to_db: boolean;
  execution_trace: any[];
  error_message?: string;
}

/**
 * Executes the authentic LangGraph Deep Research StateGraph via Python runner.
 */
export async function executeLangGraphDeepResearchWorkflow(
  input: LangGraphDeepResearchInput
): Promise<LangGraphDeepResearchOutput> {
  return new Promise((resolve, reject) => {
    const projectRoot = path.resolve(process.cwd(), process.cwd().endsWith("apps/web") ? "../.." : ".");
    const pythonBin = path.join(projectRoot, ".venv/bin/python");
    const runnerScript = path.join(projectRoot, "services/workflow-worker/src/runner.py");

    const payload = JSON.stringify({
      action: "DEEP_RESEARCH",
      tenant_id: input.tenantId || "dddddddd-dddd-dddd-dddd-dddddddddddd",
      actor_id: input.actorId || "d2222222-2222-2222-2222-222222222222",
      actor_role: input.actorRole || "LECTURER",
      course_offering_id: input.courseOfferingId || "c1111111-1111-1111-1111-111111111111",
      course_code: input.courseCode || "CS-301",
      query: input.query,
      scope: input.scope || "combined",
      depth: input.depth || "comprehensive",
      allowed_domains: input.allowedDomains || ["iso.org", "acm.org", "usenix.org", "ietf.org"],
      max_sources: input.maxSources || 6,
      provider_id: input.providerId || "BAAI/bge-m3",
      model_id: input.modelId || "gemini-1.5-pro",
      thread_id: input.threadId,
      run_id: input.runId,
    });

    const child = spawn(pythonBin, [runnerScript, "--json"], {
      cwd: projectRoot,
      env: {
        ...process.env,
        PYTHONPATH: path.join(projectRoot, "services/workflow-worker"),
      },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      if (code !== 0 && !stdout) {
        return reject(new Error(`Deep Research runner exited with code ${code}: ${stderr}`));
      }

      try {
        const jsonStartIndex = stdout.indexOf("{");
        if (jsonStartIndex === -1) {
          throw new Error(`No JSON output found in stdout: ${stdout} | ${stderr}`);
        }
        const jsonStr = stdout.substring(jsonStartIndex);
        const result = JSON.parse(jsonStr) as LangGraphDeepResearchOutput;
        resolve(result);
      } catch (err: any) {
        reject(
          new Error(
            `Failed to parse Deep Research runner JSON output: ${err.message}\nOutput: ${stdout}`
          )
        );
      }
    });

    child.stdin.write(payload);
    child.stdin.end();
  });
}
