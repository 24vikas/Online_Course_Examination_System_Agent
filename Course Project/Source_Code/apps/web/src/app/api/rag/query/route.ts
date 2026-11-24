import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { generateBgeM3Embeddings } from "../../../../lib/embeddings";
import { DEMO_CONFIG } from "../../../../lib/constants";
import { checkRateLimitAndConcurrency, releaseConcurrency } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  let rateLimitKey = "";
  try {
    const body = await req.json();
    const queryText = body.query?.trim();
    const limit = Math.min(Math.max(parseInt(body.limit || "5", 10), 1), 20);
    const tenantId = body.tenantId || DEMO_CONFIG.tenantId;
    const courseOfferingId = body.courseOfferingId;
    rateLimitKey = `rag-query:${tenantId}`;

    // Rate limiting & concurrency governance
    const rateCheck = checkRateLimitAndConcurrency(rateLimitKey, {
      capacity: 60,
      refillRatePerSec: 10,
      maxConcurrent: 10,
    });
    if (!rateCheck.allowed && rateCheck.errorResponse) {
      return rateCheck.errorResponse;
    }

    if (!queryText) {
      return NextResponse.json(
        { error: "Query text is required." },
        { status: 400 }
      );
    }

    // 1. Generate dense 1024-d embedding via self-hosted BGE-M3
    const startTime = Date.now();
    const { vectors, model, dimension, revision } = await generateBgeM3Embeddings([queryText]);
    const queryVector = vectors[0];
    const embeddingDurationMs = Date.now() - startTime;

    if (!queryVector || queryVector.length !== 1024) {
      return NextResponse.json(
        { error: "Failed to generate valid 1024-d embedding vector." },
        { status: 502 }
      );
    }

    const vectorParam = `[${queryVector.join(",")}]`;

    // 2. Scoped vector search in PostgreSQL pgvector
    const searchStartTime = Date.now();
    let courseFilterClause = "";
    const params: any[] = [vectorParam, tenantId];

    if (courseOfferingId && courseOfferingId !== "ALL") {
      params.push(courseOfferingId);
      courseFilterClause = `AND dc.course_offering_id = $${params.length}`;
    }

    params.push(limit);
    const limitParamIndex = params.length;

    const result = await queryDb(
      `SELECT 
        dc.id,
        dc.chunk_index,
        dc.content,
        dc.content_hash,
        dc.page_start,
        dc.page_end,
        dc.section_header,
        dc.element_type,
        dc.document_id,
        d.filename,
        (1 - (dc.embedding <=> $1)) AS similarity
      FROM document_chunks dc
      JOIN documents d ON d.id = dc.document_id
      WHERE dc.tenant_id = $2
        ${courseFilterClause}
        AND dc.is_active_for_retrieval = TRUE
        AND d.provenance_status != 'SUPERSEDED'
        AND dc.embedding IS NOT NULL
        AND dc.embedding_dimension = 1024
        AND dc.embedding_model = 'BAAI/bge-m3'
      ORDER BY dc.embedding <=> $1
      LIMIT $${limitParamIndex}`,
      params
    );
    const searchDurationMs = Date.now() - searchStartTime;

    const retrievedChunks = result.rows.map((row: any) => {
      const isPptx = row.filename.endsWith(".pptx");
      const citationLocator = isPptx
        ? `${row.filename}#slide=${row.page_start}`
        : `${row.filename}#page=${row.page_start}&section=${encodeURIComponent(row.section_header || "content")}`;
      const citationLink = `/api/rag/documents/${row.document_id}#page=${row.page_start}`;

      return {
        id: row.id,
        chunkId: row.id,
        chunkIndex: row.chunk_index,
        content: row.content,
        sectionHeader: row.section_header || "Course Content",
        elementType: row.element_type || "paragraph",
        pageNumber: row.page_start,
        pageStart: row.page_start,
        pageEnd: row.page_end,
        documentId: row.document_id,
        filename: row.filename,
        sourceFilename: row.filename,
        similarity: parseFloat(Number(row.similarity).toFixed(4)),
        similarityScore: parseFloat(Number(row.similarity).toFixed(4)),
        citationLocator,
        citationLink,
        citationFormatted: `[Source: ${row.filename}, ${isPptx ? "Slide " + row.page_start : "Pages " + row.page_start + "-" + row.page_end + " (" + (row.section_header || "Content") + ")"}]`,
      };
    });

    return NextResponse.json({
      query: queryText,
      totalRetrieved: retrievedChunks.length,
      scope: {
        tenantId,
        courseOfferingId: courseOfferingId || "ALL",
      },
      modelSpec: {
        model,
        dimension,
        revision,
      },
      timing: {
        embeddingMs: embeddingDurationMs,
        searchMs: searchDurationMs,
        totalMs: embeddingDurationMs + searchDurationMs,
      },
      chunks: retrievedChunks,
    });
  } catch (error: any) {
    console.error("RAG query error:", error);
    const isWorkerDown = error.message?.includes("EMBEDDING_WORKER_");
    return NextResponse.json(
      {
        error: isWorkerDown ? "SERVICE_UNAVAILABLE" : "RAG query failed",
        details: error.message,
      },
      { status: isWorkerDown ? 503 : 500 }
    );
  } finally {
    if (rateLimitKey) {
      releaseConcurrency(rateLimitKey);
    }
  }
}
