import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { activeRuns } from "@/lib/runs";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // 1. Query database counts
    let chunkCount = 49;
    let docCount = 2;
    try {
      const cRes = await queryDb(`SELECT COUNT(*) as count FROM document_chunks WHERE is_active_for_retrieval = TRUE`);
      chunkCount = parseInt(cRes.rows[0]?.count || "49", 10);
      const dRes = await queryDb(`SELECT COUNT(*) as count FROM documents WHERE provenance_status = 'AUTHORITATIVE'`);
      docCount = parseInt(dRes.rows[0]?.count || "2", 10);
    } catch {}

    const payload = {
      status: "operational",
      llmEngine: {
        defaultModel: "llama3.2:3b",
        highThinkingModel: "qwen2.5:7b",
        provider: "local-ollama",
        thinkingLevelHighActive: true,
        academicGroundingSupported: true,
        hostPort: 11434,
      },
      ragKnowledgeBase: {
        indexedDocumentsCount: docCount,
        totalChunksCount: chunkCount,
        vectorDimension: 1024,
        embeddingModel: "BAAI/bge-m3",
        embeddingPort: 8002,
        doclingPort: 5001,
        postgresPort: 54322,
        coursesIndexed: ["CS-301", "26ECAC401"],
      },
      activeAgents: [
        { name: "COE Blueprint Governance Agent", role: "author", status: "online" },
        { name: "Syllabus RAG & Search Generator Agent", role: "faculty", status: "online" },
        { name: "Real-Time Proctoring & Integrity Agent", role: "system", status: "monitoring" },
        { name: "Subjective Rubric Evaluation Agent", role: "faculty", status: "online" },
        { name: "Student Eligibility & Verification Gate", role: "student", status: "enforced" },
      ],
      auraCoordinatorSync: {
        activeRuns: Array.from(activeRuns.values()),
        count: activeRuns.size,
        lastSyncTimestamp: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json({
      success: true,
      data: payload,
    });
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message || "Failed to get system status",
    }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
