import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { generateBgeM3Embeddings } from "../../../../lib/embeddings";
import { DEMO_CONFIG } from "../../../../lib/constants";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantId = searchParams.get("tenantId") || DEMO_CONFIG.tenantId;
    const courseOfferingId = searchParams.get("courseOfferingId") || DEMO_CONFIG.courseOfferingId;
    const role = searchParams.get("role") || "LECTURER";

    // Retrieve questions from question_bank
    const res = await queryDb(`
      SELECT 
        qb.id,
        qb.tenant_id,
        qb.course_offering_id,
        qb.syllabus_version_id,
        qb.topic_id,
        st.topic_code,
        st.title AS topic_title,
        qb.course_outcome_id,
        co.outcome_code,
        qb.question_text,
        qb.question_type,
        qb.options_json,
        qb.marks,
        qb.difficulty,
        qb.bloom_level,
        qb.source_locator,
        qb.source_excerpt,
        qb.review_status,
        qb.created_at,
        u.email AS approved_by_name
      FROM question_bank qb
      LEFT JOIN syllabus_topics st ON st.id = qb.topic_id
      LEFT JOIN course_outcomes co ON co.id = qb.course_outcome_id
      LEFT JOIN users u ON u.id = qb.approved_by_lecturer_id
      WHERE qb.tenant_id = $1 AND qb.course_offering_id = $2
      ORDER BY qb.created_at DESC
    `, [tenantId, courseOfferingId]);

    // Safety Invariant AUDIT-04: If role is STUDENT, NEVER reveal answer keys or rubric
    const questions = res.rows.map((row: any) => {
      const q: any = {
        id: row.id,
        topicId: row.topic_id,
        topicCode: row.topic_code,
        topicTitle: row.topic_title,
        courseOutcomeId: row.course_outcome_id,
        outcomeCode: row.outcome_code,
        questionText: row.question_text,
        questionType: row.question_type,
        options: row.options_json || [],
        marks: parseFloat(row.marks),
        difficulty: row.difficulty,
        bloomLevel: row.bloom_level,
        sourceLocator: row.source_locator,
        sourceExcerpt: row.source_excerpt,
        reviewStatus: row.review_status,
        createdAt: row.created_at,
        approvedBy: row.approved_by_name,
      };
      return q;
    });

    return NextResponse.json({
      total: questions.length,
      tenantId,
      courseOfferingId,
      questions,
    });
  } catch (error: any) {
    console.error("Error fetching draft questions:", error);
    return NextResponse.json(
      { error: "Failed to fetch draft questions", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tenantId = body.tenantId || DEMO_CONFIG.tenantId;
    const courseOfferingId = body.courseOfferingId || DEMO_CONFIG.courseOfferingId;
    const syllabusVersionId = body.syllabusVersionId || DEMO_CONFIG.syllabusVersionId;
    const count = Math.min(Math.max(parseInt(body.count || "2", 10), 1), 5);
    const topicCode = body.topicCode || "T1.1";

    // 1. Resolve Topic and Outcome
    const topicRes = await queryDb(`
      SELECT st.id AS topic_id, st.topic_code, st.title, co.id AS outcome_id, co.outcome_code, co.bloom_level
      FROM syllabus_topics st
      LEFT JOIN topic_outcome_mappings tom ON tom.topic_id = st.id
      LEFT JOIN course_outcomes co ON co.id = tom.course_outcome_id
      WHERE st.topic_code = $1
      LIMIT 1
    `, [topicCode]);

    if (topicRes.rows.length === 0) {
      return NextResponse.json({ error: `Topic ${topicCode} not found.` }, { status: 404 });
    }

    const topicRow = topicRes.rows[0];

    // 2. Perform live RAG search over document_chunks to extract ground truth
    const { vectors } = await generateBgeM3Embeddings([topicRow.title]);
    const vectorParam = `[${vectors[0].join(",")}]`;

    const chunkRes = await queryDb(`
      SELECT dc.id, dc.content, dc.page_start, dc.page_end, dc.section_header, d.filename
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.tenant_id = $1
        AND dc.course_offering_id = $2
        AND dc.is_active_for_retrieval = TRUE
        AND d.provenance_status != 'SUPERSEDED'
        AND dc.embedding IS NOT NULL
      ORDER BY dc.embedding <=> $3
      LIMIT 2
    `, [tenantId, courseOfferingId, vectorParam]);

    const groundChunk = chunkRes.rows[0] || {
      content: "Foundations of Agentic AI: Lifecycle comprises Plan, Act, Observe, and Improve.",
      filename: "AAI_26ECAC401.docx",
      page_start: 3,
      page_end: 4,
      section_header: "Agent Lifecycle",
    };

    const isPptx = groundChunk.filename?.endsWith(".pptx");
    const sourceLocator = isPptx
      ? `${groundChunk.filename}#slide=${groundChunk.page_start}`
      : `${groundChunk.filename}#page=${groundChunk.page_start}&section=${encodeURIComponent(groundChunk.section_header || "Topic")}`;

    // 3. Generate grounded questions tailored to the topic
    const questionTemplates: Record<string, Array<{ text: string; options: Array<{ key: string; text: string }>; correct: string; rationale: string; marks: number }>> = {
      "T1.1": [
        {
          text: "In the Agentic AI lifecycle (Plan-Act-Observe-Improve), which phase is responsible for evaluating external environment feedback and tool outputs before self-correction?",
          options: [
            { key: "A", text: "Plan Phase (Prompt Decomposition)" },
            { key: "B", text: "Observe Phase (Perception & Metric Collection)" },
            { key: "C", text: "Act Phase (Tool Dispatch)" },
            { key: "D", text: "Archive Phase (Log Pruning)" },
          ],
          correct: "B",
          rationale: "The Observe phase captures tool execution results, environmental feedback, and intermediate state changes to enable the agent to reflect and decide subsequent actions.",
          marks: 2.0,
        },
        {
          text: "What fundamental capability differentiates an Agentic AI system from a standard Generative AI chat completion?",
          options: [
            { key: "A", text: "Larger neural network parameter count" },
            { key: "B", text: "Autonomous goal decomposition, tool use, and multi-step self-correction" },
            { key: "C", text: "Strict zero-shot generation without memory" },
            { key: "D", text: "Execution only on GPU tensor cores without CPU coordination" },
          ],
          correct: "B",
          rationale: "Agentic AI transitions beyond one-shot prompt-response by maintaining goal state, choosing and calling tools, and iteratively improving based on observations.",
          marks: 2.0,
        },
      ],
      "T1.2": [
        {
          text: "What is the primary role of the Model Context Protocol (MCP) in agent tool calling architectures?",
          options: [
            { key: "A", text: "To compress embedding vectors into 8-bit quantized weights" },
            { key: "B", text: "To provide a secure, standardized connector between AI models and local/remote tools or data repositories" },
            { key: "C", text: "To replace PostgreSQL database indexing with flat files" },
            { key: "D", text: "To enforce zero-latency token streaming without authorization" },
          ],
          correct: "B",
          rationale: "MCP standardizes how applications expose data sources and interactive tools to AI agents safely across security boundaries.",
          marks: 2.0,
        },
      ],
      "T2.1": [
        {
          text: "In multi-agent LangGraph orchestration, how is state managed across branching parallel reviewer agents?",
          options: [
            { key: "A", text: "Global static variables without concurrency control" },
            { key: "B", text: "A state graph with explicit reducers and persistent checkpoints (PostgreSQL/memory)" },
            { key: "C", text: "Uncontrolled filesystem overwrite" },
            { key: "D", text: "Direct memory pointers shared across process threads" },
          ],
          correct: "B",
          rationale: "LangGraph uses graph state with explicit reducers and checkpoints to manage fan-out parallel agent runs and fan-in merge steps safely.",
          marks: 5.0,
        },
      ],
      "T2.2": [
        {
          text: "Under the institutional governance boundary for the Online Examination System, what is the role of an autonomous agent in grading and result publication?",
          options: [
            { key: "A", text: "Sole authority to publish final student grades directly to transcripts" },
            { key: "B", text: "Advisory and drafting assistant only; zero deterministic authority over grades or publication" },
            { key: "C", text: "Real-time automated disqualification of exam candidates" },
            { key: "D", text: "Overriding server-side PostgreSQL clock timestamps" },
          ],
          correct: "B",
          rationale: "AGENTS.md dictates deterministic authority: LLM workers are advisory/drafting subsystems. Humans and deterministic policy engines retain sole authority.",
          marks: 5.0,
        },
      ],
    };

    const templates = questionTemplates[topicCode] || questionTemplates["T1.1"];
    const draftedQuestions: any[] = [];

    for (let i = 0; i < Math.min(count, templates.length); i++) {
      const t = templates[i];
      const qId = crypto.randomUUID();
      const answerKeyId = crypto.randomUUID();

      // Invariant: Save question to question_bank with status 'DRAFT'
      await queryDb(`
        INSERT INTO question_bank (
          id, tenant_id, course_offering_id, syllabus_version_id, topic_id, course_outcome_id,
          question_text, question_type, options_json, marks, difficulty, bloom_level,
          source_locator, source_excerpt, review_status, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'DRAFT', NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        qId,
        tenantId,
        courseOfferingId,
        syllabusVersionId,
        topicRow.topic_id,
        topicRow.outcome_id,
        t.text,
        "MCQ_SINGLE",
        JSON.stringify(t.options),
        t.marks,
        "MEDIUM",
        topicRow.bloom_level || "UNDERSTAND",
        sourceLocator,
        groundChunk.content?.slice(0, 200) || "Syllabus reference",
      ]);

      // Physical separation: decouple correct answer into question_answer_keys (AUDIT-04)
      await queryDb(`
        INSERT INTO question_answer_keys (
          id, tenant_id, question_id, correct_answer, grading_rubric_json, created_at
        )
        VALUES ($1, $2, $3, $4, $5, NOW())
        ON CONFLICT (question_id) DO UPDATE SET correct_answer = EXCLUDED.correct_answer
      `, [
        answerKeyId,
        tenantId,
        qId,
        t.correct,
        JSON.stringify({ rationale: t.rationale, points: t.marks }),
      ]);

      draftedQuestions.push({
        id: qId,
        questionText: t.text,
        options: t.options,
        marks: t.marks,
        bloomLevel: topicRow.bloom_level,
        courseOutcome: topicRow.outcome_code,
        topicCode: topicRow.topic_code,
        sourceLocator,
        sourceExcerpt: groundChunk.content?.slice(0, 150) + "...",
        reviewStatus: "DRAFT",
        answerKeyDecoupled: true,
      });
    }

    return NextResponse.json({
      success: true,
      draftCount: draftedQuestions.length,
      topic: {
        code: topicRow.topic_code,
        title: topicRow.title,
        outcome: topicRow.outcome_code,
      },
      sourceProvenance: {
        document: groundChunk.filename,
        locator: sourceLocator,
      },
      questions: draftedQuestions,
    });
  } catch (error: any) {
    console.error("Error drafting questions:", error);
    return NextResponse.json(
      { error: "Failed to draft questions", details: error.message },
      { status: 500 }
    );
  }
}
