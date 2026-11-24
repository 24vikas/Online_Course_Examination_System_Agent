import { POST as reviewBlueprint } from "../notifications/route";
import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { resolveAuth } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "COE_ADMIN" && authUser.role !== "LECTURER") {
      return NextResponse.json({ error: "Forbidden: Only COE_ADMIN or LECTURER can view blueprints" }, { status: 403 });
    }
    const tenantId = authUser.tenantId;

    // Query blueprints scoped by tenant
    const res = await queryDb(`
      SELECT 
        eb.id,
        eb.title,
        eb.total_marks as "totalMarks",
        eb.duration_minutes as "durationMinutes",
        eb.status,
        eb.assessment_type as "assessmentType",
        eb.sections_json as "sectionsJson",
        eb.revision_notes as "revisionNotes",
        eb.rejection_reason as "rejectionReason",
        eb.submitted_at as "submittedAt",
        eb.created_at as "createdAt",
        mc.course_code as "courseCode",
        mc.course_title as "courseTitle",
        sv.version_tag as "syllabusVersion",
        u.email as "submittedBy",
        eb.approved_at as "approvedAt"
      FROM exam_blueprints eb
      JOIN course_offerings co ON co.id = eb.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      JOIN syllabus_versions sv ON sv.id = eb.syllabus_version_id
      LEFT JOIN users u ON u.id = COALESCE(eb.submitted_by, co.primary_lecturer_id)
      WHERE eb.tenant_id = $1 AND co.tenant_id = $1
      ORDER BY 
        CASE WHEN eb.status = 'PENDING_COE_APPROVAL' THEN 0 ELSE 1 END,
        eb.created_at DESC
    `, [tenantId]);

    return NextResponse.json({
      success: true,
      blueprints: res.rows.map((row: any) => {
        let sections = [];
        try {
          if (Array.isArray(row.sectionsJson)) sections = row.sectionsJson;
          else if (typeof row.sectionsJson === "string") sections = JSON.parse(row.sectionsJson);
        } catch {
          sections = [];
        }

        return {
          id: row.id,
          title: row.title,
          courseCode: row.courseCode,
          courseTitle: row.courseTitle,
          syllabusVersion: row.syllabusVersion,
          totalMarks: Number(row.totalMarks),
          durationMinutes: row.durationMinutes,
          submittedBy: row.submittedBy ? `Faculty: ${row.submittedBy}` : "Prof. Arthur Vance",
          submittedAt: row.submittedAt || row.createdAt,
          status: row.status,
          sections,
          revisionNotes: row.revisionNotes,
          rejectionReason: row.rejectionReason,
          approvedAt: row.approvedAt,
        };
      }),
    });
  } catch (error: any) {
    logEvent("error", "Error fetching blueprints", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (action === "SUBMIT_FOR_REVIEW") {
      if (authUser.role !== "LECTURER" && authUser.role !== "COE_ADMIN") {
        return NextResponse.json({ error: "Forbidden: Only faculty or COE can submit blueprints" }, { status: 403 });
      }
    } else {
      if (authUser.role !== "COE_ADMIN") {
        logEvent("warn", "Unauthorized attempt to review COE blueprints", {
          user: authUser?.userId,
          role: authUser?.role,
        });
        return NextResponse.json(
          { error: "Forbidden: Only COE_ADMIN can approve, reject, or request revisions for blueprints" },
          { status: 403 }
        );
      }
    }
    const coeAdminId = authUser.userId;
    const tenantId = authUser.tenantId;
    const { id, rejectionReason, revisionNotes, comments } = body;

    if (!id || !action) {
      return NextResponse.json({ error: "Missing id or action" }, { status: 400 });
    }

    if (action === "SUBMIT_FOR_REVIEW") {
      const updateRes = await queryDb(`
        UPDATE exam_blueprints
        SET status = 'PENDING_COE_APPROVAL',
            submitted_by = $1,
            submitted_at = NOW(),
            updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
        RETURNING *
      `, [authUser.userId, id, tenantId]);

      if (updateRes.rows.length === 0) {
        return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
      }

      logEvent("info", "Faculty submitted blueprint for COE review", { blueprintId: id, facultyId: authUser.userId });

      return NextResponse.json({
        success: true,
        message: `Blueprint '${id}' submitted for COE approval.`,
        status: "PENDING_COE_APPROVAL",
      });
    }

    if (action === "REQUEST_REVISION") {
      const notes = (comments || revisionNotes || "").trim();
      if (!notes) {
        return NextResponse.json(
          { error: "Mandatory comment required: please specify revision feedback for faculty." },
          { status: 400 }
        );
      }

      const updateRes = await queryDb(`
        UPDATE exam_blueprints
        SET status = 'REVISION_REQUESTED',
            revision_notes = $1,
            updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
        RETURNING *
      `, [notes, id, tenantId]);

      if (updateRes.rows.length === 0) {
        return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
      }

      // Record audit event
      await queryDb(`
        INSERT INTO audit_events (id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at)
        VALUES ($1, $2, $3, 'COE_BLUEPRINT_REVISION_REQUESTED', 'exam_blueprint', $4, $5, NOW())
      `, [
        crypto.randomUUID(),
        tenantId,
        coeAdminId,
        id,
        JSON.stringify({ notes, action: "REQUEST_REVISION" }),
      ]);

      logEvent("info", "COE requested revision for blueprint", { blueprintId: id, notes });

      const nextPendingRes = await queryDb(
        `SELECT id FROM exam_blueprints WHERE status = 'PENDING_COE_APPROVAL' AND id != $1 AND tenant_id = $2 ORDER BY created_at ASC LIMIT 1`,
        [id, tenantId]
      );

      return NextResponse.json({
        success: true,
        message: `Blueprint '${id}' marked for revision with feedback.`,
        status: "REVISION_REQUESTED",
        revisionNotes: notes,
        nextItem: nextPendingRes.rows[0] ? { id: nextPendingRes.rows[0].id } : null,
      });
    }

    if (action === "APPROVE") {
      return reviewBlueprint(new NextRequest(req.url,{
        method:"POST",headers:req.headers,body:JSON.stringify(body)
      }));
    }

    if (action === "REJECT") {
      const reason = (comments || rejectionReason || "").trim();
      if (!reason) {
        return NextResponse.json(
          { error: "Mandatory comment required: please state the formal reason for rejection." },
          { status: 400 }
        );
      }

      const updateRes = await queryDb(`
        UPDATE exam_blueprints
        SET status = 'REJECTED',
            rejection_reason = $1,
            updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3
        RETURNING *
      `, [reason, id, tenantId]);

      if (updateRes.rows.length === 0) {
        return NextResponse.json({ error: "Blueprint not found" }, { status: 404 });
      }

      // Record audit event
      await queryDb(`
        INSERT INTO audit_events (id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at)
        VALUES ($1, $2, $3, 'COE_BLUEPRINT_REJECTED', 'exam_blueprint', $4, $5, NOW())
      `, [
        crypto.randomUUID(),
        tenantId,
        coeAdminId,
        id,
        JSON.stringify({ reason, action: "REJECT" }),
      ]);

      logEvent("info", "COE rejected blueprint", { blueprintId: id, reason });

      const nextPendingRes = await queryDb(
        `SELECT id FROM exam_blueprints WHERE status = 'PENDING_COE_APPROVAL' AND id != $1 AND tenant_id = $2 ORDER BY created_at ASC LIMIT 1`,
        [id, tenantId]
      );

      return NextResponse.json({
        success: true,
        message: `Blueprint '${id}' rejected and returned with feedback.`,
        status: "REJECTED",
        rejectionReason: reason,
        nextItem: nextPendingRes.rows[0] ? { id: nextPendingRes.rows[0].id } : null,
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    logEvent("error", "Error updating blueprint", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
