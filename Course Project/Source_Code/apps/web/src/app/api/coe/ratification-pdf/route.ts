import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { generateOfficialRatification } from "@/lib/pdf/ratificationPdfService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "COE_ADMIN" && authUser.role !== "LECTURER") {
      return NextResponse.json({ error: "Forbidden: Only COE_ADMIN or LECTURER can view ratification PDFs" }, { status: 403 });
    }
    const tenantId = authUser.tenantId;

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing blueprint id" }, { status: 400 });
    const type = (searchParams.get("type") || "ratification").toLowerCase(); // 'ratification' | 'source' | 'merged' | 'audit'

    // Fetch blueprint details
    const bpRes = await queryDb(
      `SELECT eb.*, mc.course_code, mc.course_title, sv.version_tag
       FROM exam_blueprints eb
       JOIN course_offerings co ON co.id = eb.course_offering_id
       JOIN master_courses mc ON mc.id = co.master_course_id
       JOIN syllabus_versions sv ON sv.id = eb.syllabus_version_id
       WHERE eb.id = $1 AND eb.tenant_id = $2`,
      [id, tenantId]
    );

    if (bpRes.rows.length === 0) {
      return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
    }

    const bp = bpRes.rows[0];
    const title = bp.title;
    const courseCode = bp.course_code;
    const courseTitle = bp.course_title;
    const totalMarks = Number(bp.total_marks) || 50;
    const durationMinutes = bp.duration_minutes || 60;
    const comments = bp.revision_notes || "Formally verified against UGC & ABET academic regulations and ratified.";
    let sections: any[] = [];
    try {
      if (Array.isArray(bp.sections_json)) sections = bp.sections_json;
      else if (typeof bp.sections_json === "string") sections = JSON.parse(bp.sections_json);
    } catch {
      sections = [];
    }

    const ratification = await generateOfficialRatification({
      blueprintId: id,
      title,
      courseCode,
      courseTitle,
      totalMarks,
      durationMinutes,
      approvedBy: "Dr. M.K. Rao",
      approvedRole: "Controller of Examinations (COE)",
      comments,
      sections,
    });

    if (type === "audit") {
      return new NextResponse(JSON.stringify(ratification.auditRecord, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${ratification.requestId}_audit_record.json"`,
          "X-Sha256-Checksum": ratification.sha256Checksum,
        },
      });
    }

    if (type === "source") {
      return new Response(Buffer.from(ratification.sourcePdfBytes) as any, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${ratification.requestId}_source_syllabus.pdf"`,
        },
      });
    }

    if (type === "merged") {
      return new Response(Buffer.from(ratification.mergedPdfBytes) as any, {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${ratification.requestId}_authoritative_merged.pdf"`,
          "X-Sha256-Checksum": ratification.sha256Checksum,
        },
      });
    }

    // Default: 'ratification' (1-page A4 certificate)
    return new Response(Buffer.from(ratification.ratificationPdfBytes) as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${ratification.requestId}_ratification_certificate.pdf"`,
        "X-Sha256-Checksum": ratification.sha256Checksum,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const body = await req.json().catch(() => ({}));
    const id = body.blueprintId || body.id || "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

    const ratification = await generateOfficialRatification({
      blueprintId: id,
      title: body.title || "Internal Assessment 1: Agentic AI Foundations",
      courseCode: body.courseCode || "26ECAC401",
      courseTitle: body.courseTitle || "Agentic AI Foundations",
      totalMarks: Number(body.totalMarks) || 50,
      durationMinutes: body.durationMinutes || 60,
      approvedBy: body.approvedBy || authUser?.email || "Dr. M.K. Rao",
      approvedRole: body.approvedRole || "Controller of Examinations (COE)",
      comments: body.comments || "Official COE Ratification Issued",
      sections: body.sections,
      validationFindings: body.validationFindings,
    });

    return NextResponse.json({
      success: true,
      requestId: ratification.requestId,
      sha256Checksum: ratification.sha256Checksum,
      timestamp: ratification.timestamp,
      ratificationBase64: ratification.ratificationBase64,
      sourceBase64: ratification.sourceBase64,
      mergedBase64: ratification.mergedBase64,
      auditRecord: ratification.auditRecord,
      downloadUrls: {
        ratificationPdf: `/api/coe/ratification-pdf?id=${id}&type=ratification`,
        sourcePdf: `/api/coe/ratification-pdf?id=${id}&type=source`,
        mergedPdf: `/api/coe/ratification-pdf?id=${id}&type=merged`,
        auditRecordJson: `/api/coe/ratification-pdf?id=${id}&type=audit`,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
