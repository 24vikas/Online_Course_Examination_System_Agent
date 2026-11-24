import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { DEMO_CONFIG } from "../../../../lib/constants";
import { checkSyllabusPdfStaging } from "@exam-system/ingestion-worker";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId") || DEMO_CONFIG.tenantId;
    const courseCode = url.searchParams.get("courseCode") || DEMO_CONFIG.courseCode;

    // 1. Check PostgreSQL stats
    const chunkStats = await queryDb(
      `SELECT 
        count(*)::int AS total_chunks,
        count(embedding)::int AS embedded_chunks,
        count(DISTINCT document_id)::int AS total_documents
      FROM document_chunks
      WHERE tenant_id = $1`,
      [tenantId]
    );

    // 2. Query documents with chunk and page counts
    const docList = await queryDb(
      `SELECT d.id, d.filename, d.mime_type, d.file_size_bytes, d.sha256_hash, d.status,
              d.provenance_status, d.created_at, d.updated_at, d.course_offering_id, d.syllabus_version_id,
              count(dc.id)::int as chunk_count,
              coalesce(max(dc.page_end), max(dc.page_start), 1) as page_count
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       WHERE d.tenant_id = $1
       GROUP BY d.id, d.filename, d.mime_type, d.file_size_bytes, d.sha256_hash, d.status,
                d.provenance_status, d.created_at, d.updated_at, d.course_offering_id, d.syllabus_version_id
       ORDER BY d.created_at DESC`,
      [tenantId]
    );

    // 3. Check embedding worker health
    let embeddingWorkerStatus = "UNKNOWN";
    try {
      const workerUrl = process.env.EMBEDDING_WORKER_URL || "http://127.0.0.1:8002";
      const healthRes = await fetch(`${workerUrl}/health`, { signal: AbortSignal.timeout(2000) });
      if (healthRes.ok) {
        const body = await healthRes.json();
        embeddingWorkerStatus = body.status || "HEALTHY";
      } else {
        embeddingWorkerStatus = `UNHEALTHY (HTTP ${healthRes.status})`;
      }
    } catch (e: any) {
      embeddingWorkerStatus = `UNAVAILABLE: ${e.message}`;
    }

    // 4. Check generation provider health
    let genProviderStatus = "GENERATION_PROVIDER_NOT_CONFIGURED";
    let genProviderName = "NONE";
    let genModelName = "NONE";
    let genMode = "DETERMINISTIC_ACADEMIC_FIXTURES";

    if (process.env.GPUSTACK_API_KEY || process.env.OPENAI_API_KEY) {
      genProviderStatus = "CONFIGURED";
      genProviderName = process.env.GPUSTACK_API_KEY ? "gpustack" : "openai";
      genModelName = process.env.GENERATION_MODEL || "gpt-4o-mini";
      genMode = "LIVE_INFERENCE";
    } else {
      // Check local Ollama endpoint (GTX 1650 4GB VRAM / loopback)
      try {
        const ollamaBase = process.env.GENERATION_BASE_URL
          ? process.env.GENERATION_BASE_URL.replace(/\/v1\/?$/, "")
          : "http://127.0.0.1:11434";
        const tagsRes = await fetch(`${ollamaBase}/api/tags`, { signal: AbortSignal.timeout(1500) });
        if (tagsRes.ok) {
          const tagsBody = await tagsRes.json();
          const models = (tagsBody.models || []).map((m: any) => m.name);
          const activeModel = models.find((m: string) => m.includes("llama3.2") || m.includes("qwen"));
          if (activeModel) {
            genProviderStatus = "CONFIGURED";
            genProviderName = "ollama-local";
            genModelName = activeModel;
            genMode = "LOCAL_MODEL_INFERENCE";
          }
        }
      } catch {
        // Fallback remains GENERATION_PROVIDER_NOT_CONFIGURED
      }
    }

    // 5. Staging syllabus check (Task 5)
    const stagingCheck = checkSyllabusPdfStaging(courseCode);

    return NextResponse.json({
      status: "READY",
      tenant: {
        id: tenantId,
        name: DEMO_CONFIG.tenantName,
        courseCode,
        courseTitle: courseCode === "26ECAC401" ? "Agentic AI Architecture" : DEMO_CONFIG.courseTitle,
      },
      embeddingProvider: {
        model: DEMO_CONFIG.model.id,
        dimension: DEMO_CONFIG.model.dimension,
        revision: DEMO_CONFIG.model.revision,
        provider: DEMO_CONFIG.model.provider,
        status: embeddingWorkerStatus,
      },
      generationProvider: {
        status: genProviderStatus,
        provider: genProviderName,
        model: genModelName,
        mode: genMode,
      },
      stats: {
        totalChunks: chunkStats.rows[0]?.total_chunks || 0,
        embeddedChunks: chunkStats.rows[0]?.embedded_chunks || 0,
        totalDocuments: chunkStats.rows[0]?.total_documents || 0,
      },
      documents: docList.rows,
      stagingSyllabus: stagingCheck,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch RAG status", details: error.message },
      { status: 500 }
    );
  }
}
