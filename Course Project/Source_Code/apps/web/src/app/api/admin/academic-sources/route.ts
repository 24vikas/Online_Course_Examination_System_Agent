import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { assertAuthorized } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";
import { AcademicSourceService } from "@exam-system/api";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const rootDir = process.cwd();
    const service = new AcademicSourceService({ query: queryDb });
    const sources = await service.listSources(tenantId, rootDir, "data store");

    return NextResponse.json({
      success: true,
      sources,
      count: sources.length,
    });
  } catch (error: any) {
    logEvent("error", "Error listing academic sources", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;
    const userId = authResult.user.userId;
    const userRole = authResult.user.role as "COE_ADMIN" | "LECTURER";

    const body = await req.json();
    const {
      filename,
      courseCode,
      semester,
      academicYear,
      category,
      provenanceStatus,
      adminNotes,
      supersedesDocumentId,
      courseOfferingId,
      syllabusVersionId,
    } = body;

    if (!filename || !courseCode || !semester || !category || !provenanceStatus) {
      return NextResponse.json(
        { error: "filename, courseCode, semester, category, and provenanceStatus are required" },
        { status: 400 }
      );
    }

    // Resolve default course offering and syllabus version if not supplied
    let offeringId = courseOfferingId;
    let syllabusId = syllabusVersionId;

    if (!offeringId || !syllabusId) {
      const offRes = await queryDb(
        `SELECT id, syllabus_version_id FROM course_offerings WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      if (offRes.rows.length > 0) {
        offeringId = offRes.rows[0].id;
        syllabusId = offRes.rows[0].syllabus_version_id;
      } else {
        return NextResponse.json(
          { error: "No course offering found for tenant." },
          { status: 400 }
        );
      }
    }

    const service = new AcademicSourceService({ query: queryDb });
    const result = await service.ingestSource(
      tenantId,
      userId,
      userRole,
      {
        filename,
        courseCode,
        semester: Number(semester),
        academicYear,
        category,
        provenanceStatus,
        adminNotes,
        supersedesDocumentId,
      },
      offeringId,
      syllabusId
    );

    logEvent("info", "Academic source ingested / status updated", {
      tenantId,
      documentId: result.documentId,
      provenanceStatus: result.provenanceStatus,
      supersededCount: result.supersededCount,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    logEvent("error", "Error ingesting academic source", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
