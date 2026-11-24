import { NextRequest, NextResponse } from "next/server";
import { queryDb, getDbPool } from "../../../../lib/db";
import { DEMO_CONFIG } from "../../../../lib/constants";
import { resolveAuth } from "@/lib/auth";
import {
  runIngestionPipeline,
  checkSyllabusPdfStaging,
  validateUploadFile,
} from "@exam-system/ingestion-worker";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenantId = url.searchParams.get("tenantId") || DEMO_CONFIG.tenantId;
    const courseCode = url.searchParams.get("courseCode") || DEMO_CONFIG.courseCode;

    const docs = await queryDb(
      `SELECT d.id, d.filename, d.sha256_hash, d.status, d.file_size_bytes, d.mime_type,
              d.created_at, d.provenance_status, d.course_offering_id, d.syllabus_version_id,
              count(dc.id)::int as chunk_count
       FROM documents d
       LEFT JOIN document_chunks dc ON dc.document_id = d.id
       WHERE d.tenant_id = $1
       GROUP BY d.id, d.filename, d.sha256_hash, d.status, d.file_size_bytes, d.mime_type,
                d.created_at, d.provenance_status, d.course_offering_id, d.syllabus_version_id
       ORDER BY d.created_at DESC`,
      [tenantId]
    );

    const stagingCheck = checkSyllabusPdfStaging(courseCode);

    return NextResponse.json({
      status: "COMPLETED",
      tenantId,
      documents: docs.rows,
      stagingSyllabus: stagingCheck,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to get ingestion status", details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const tenantId = authUser?.tenantId || DEMO_CONFIG.tenantId;
    const userId = authUser?.userId || DEMO_CONFIG.users.coeAdmin.id;

    let filename = "";
    let fileBuffer: Buffer | null = null;
    let declaredMimeType: string | undefined;
    let courseOfferingId = DEMO_CONFIG.courseOfferingId;
    let syllabusVersionId = DEMO_CONFIG.syllabusVersionId;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No file provided in multipart/form-data payload." },
          { status: 400 }
        );
      }

      filename = file.name;
      declaredMimeType = file.type || undefined;
      const arrayBuffer = await file.arrayBuffer();
      fileBuffer = Buffer.from(arrayBuffer);

      if (formData.get("courseOfferingId")) {
        courseOfferingId = String(formData.get("courseOfferingId"));
      }
      if (formData.get("syllabusVersionId")) {
        syllabusVersionId = String(formData.get("syllabusVersionId"));
      }
    } else {
      // JSON payload
      const body = await req.json();
      filename = body.filename || "Uploaded_Document.pdf";
      declaredMimeType = body.mimeType;
      if (body.courseOfferingId) courseOfferingId = body.courseOfferingId;
      if (body.syllabusVersionId) syllabusVersionId = body.syllabusVersionId;

      if (body.base64) {
        fileBuffer = Buffer.from(body.base64, "base64");
      } else if (body.content) {
        fileBuffer = Buffer.from(body.content, "utf-8");
      } else {
        return NextResponse.json(
          { error: "Missing file content. Provide 'base64' or raw 'content' in JSON." },
          { status: 400 }
        );
      }
    }

    if (!fileBuffer || fileBuffer.length === 0) {
      return NextResponse.json(
        { error: "Empty (0-byte) file rejected. Minimum 1 byte required." },
        { status: 400 }
      );
    }

    // Run full Knowledge Ingestion Pipeline:
    // UPLOAD -> VALIDATE -> EXTRACT (Docling 5001) -> CHUNK -> EMBED (BGE-M3 8002) -> pgvector 54322 -> READY
    const result = await runIngestionPipeline({
      tenantId,
      courseOfferingId,
      syllabusVersionId,
      uploadedBy: userId,
      filename,
      fileBuffer,
      declaredMimeType,
      dbPool: getDbPool(),
    });

    return NextResponse.json({
      success: true,
      message: `Document '${filename}' successfully processed through Docling and embedded into pgvector.`,
      data: result,
    });
  } catch (err: any) {
    console.error("Knowledge ingestion error:", err);
    return NextResponse.json(
      {
        success: false,
        error: err.message || "Ingestion pipeline failure",
      },
      { status: err.message?.startsWith("VALIDATION_FAILED") ? 400 : 500 }
    );
  }
}
