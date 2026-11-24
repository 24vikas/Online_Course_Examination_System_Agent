import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { z } from "zod";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

const blueprintInput = z.object({
  id: z.string().uuid().optional(),
  courseOfferingId: z.string().uuid(),
  syllabusVersionId: z.string().uuid(),
  title: z.string().trim().min(1).max(255),
  assessmentType: z.string().trim().min(1).max(64).default("INTERNAL_ASSESSMENT"),
  totalMarks: z.number().positive().max(1000),
  durationMinutes: z.number().int().min(5).max(360),
  sections: z.array(z.object({name:z.string().trim().min(1),marks:z.number().positive().max(1000),questionIds:z.array(z.string().uuid()).max(500).optional()}).passthrough()).max(50),
  targetTopicIds: z.array(z.string().uuid()).max(500).default([]),
  submitForReview: z.boolean().default(false),
});

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error:"Unauthorized"}, {status:401});
    if (authUser.role !== "LECTURER") return NextResponse.json({error:"Forbidden"}, {status:403});
    const {tenantId,userId:lecturerId} = authUser;

    const result = await queryDb(`
      SELECT 
        eb.id,
        eb.title,
        eb.assessment_type as "assessmentType",
        eb.total_marks as "totalMarks",
        eb.duration_minutes as "durationMinutes",
        eb.status,
        eb.sections_json as "sections",
        eb.target_topic_ids_json as "targetTopicIds",
        eb.rejection_reason as "rejectionReason",
        eb.revision_notes as "revisionNotes",
        eb.submitted_at as "submittedAt",
        eb.approved_at as "approvedAt",
        eb.created_at as "createdAt",
        mc.course_code as "courseCode",
        mc.course_title as "courseTitle",
        co.section
      FROM exam_blueprints eb
      JOIN course_offerings co ON co.id = eb.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE eb.tenant_id = $1 AND co.tenant_id=$1 AND eb.submitted_by=$2
      ORDER BY eb.created_at DESC
    `, [tenantId,lecturerId]);

    return NextResponse.json({
      success: true,
      blueprints: result.rows.map((r: any) => ({
        id: r.id,
        title: r.title,
        courseCode: r.courseCode,
        courseTitle: r.courseTitle,
        section: r.section,
        assessmentType: r.assessmentType,
        totalMarks: Number(r.totalMarks),
        durationMinutes: r.durationMinutes,
        status: r.status,
        sections: r.sections,
        rejectionReason: r.rejectionReason,
        revisionNotes: r.revisionNotes,
        submittedAt: r.submittedAt,
        approvedAt: r.approvedAt,
        createdAt: r.createdAt,
      })),
    });
  } catch (error: any) {
    logEvent("error", "Error fetching lecturer blueprints", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error:"Unauthorized"}, {status:401});
    if (authUser.role !== "LECTURER") return NextResponse.json({error:"Forbidden"}, {status:403});
    const {tenantId,userId:lecturerId} = authUser;
    const parsed = blueprintInput.safeParse(await req.json().catch(()=>null));
    if (!parsed.success) return NextResponse.json({error:"Invalid blueprint fields"}, {status:400});
    const {id,courseOfferingId,syllabusVersionId,title,assessmentType,totalMarks,durationMinutes,
      sections,targetTopicIds,submitForReview} = parsed.data;
    const sectionTotal = sections.reduce((sum, section) => sum + section.marks,0);
    if (submitForReview && (!sections.length || Math.abs(sectionTotal-totalMarks)>0.000001)) {
      return NextResponse.json({error:"Section marks must add up to total marks"}, {status:422});
    }

    const questionIds = sections.flatMap(section=>section.questionIds ?? []);
    if (new Set(questionIds).size !== questionIds.length) {
      return NextResponse.json({error:"A question can appear in only one section"}, {status:422});
    }

    const blueprintId = id || crypto.randomUUID();
    const status = submitForReview ? "PENDING_COE_APPROVAL" : "DRAFT";
    const blueprintTitle = title || `Assessment Blueprint: ${totalMarks} Marks`;

    const result = await queryDb(`
      INSERT INTO exam_blueprints (
        id, tenant_id, course_offering_id, syllabus_version_id, assessment_type,
        title, total_marks, duration_minutes, allowed_attempts, status,
        sections_json, target_topic_ids_json, submitted_by, submitted_at, created_at, updated_at
      ) SELECT
        $1, $2, $3, $4, $5,
        $6, $7, $8, 1, $9::blueprint_status_type,
        $10, $11, $12, CASE WHEN $9 = 'PENDING_COE_APPROVAL' THEN NOW() ELSE NULL END, NOW(), NOW()
      FROM course_offerings co
      JOIN master_courses mc ON mc.id=co.master_course_id
      JOIN subjects sub ON sub.subject_code=mc.course_code
      JOIN syllabus_versions sv ON sv.subject_id=sub.id AND sv.id=$4 AND sv.tenant_id=$2
      WHERE co.id=$3 AND co.tenant_id=$2 AND (co.primary_lecturer_id=$12 OR EXISTS (
        SELECT 1 FROM faculty_course_assignments f
        WHERE f.tenant_id=$2 AND f.course_offering_id=co.id AND f.faculty_id=$12 AND f.is_active
          AND f.role_in_course IN ('PRIMARY_LECTURER','CO_LECTURER')
      ))
      AND NOT EXISTS (
        SELECT 1 FROM unnest($13::uuid[]) AS requested(id)
        WHERE NOT EXISTS (
          SELECT 1 FROM question_bank q WHERE q.id=requested.id AND q.tenant_id=$2
            AND q.course_offering_id=$3 AND q.syllabus_version_id=$4 AND q.authored_by=$12
            AND ($9 <> 'PENDING_COE_APPROVAL' OR q.review_status IN ('PENDING_COE_APPROVAL','APPROVED_FOR_QUESTION_BANK'))
        )
      )
      ON CONFLICT (id) DO UPDATE SET
        title = EXCLUDED.title,
        total_marks = EXCLUDED.total_marks,
        duration_minutes = EXCLUDED.duration_minutes,
        sections_json = EXCLUDED.sections_json,
        target_topic_ids_json = EXCLUDED.target_topic_ids_json,
        status = CASE WHEN $9 = 'PENDING_COE_APPROVAL' THEN 'PENDING_COE_APPROVAL'::blueprint_status_type ELSE exam_blueprints.status END,
        submitted_by = CASE WHEN $9 = 'PENDING_COE_APPROVAL' THEN EXCLUDED.submitted_by ELSE exam_blueprints.submitted_by END,
        submitted_at = CASE WHEN $9 = 'PENDING_COE_APPROVAL' THEN NOW() ELSE exam_blueprints.submitted_at END,
        updated_at = NOW()
      WHERE exam_blueprints.tenant_id=$2 AND exam_blueprints.submitted_by=$12
        AND exam_blueprints.course_offering_id=$3 AND exam_blueprints.syllabus_version_id=$4
        AND exam_blueprints.status::text IN ('DRAFT','REVISION_REQUESTED')
      RETURNING *
    `, [
      blueprintId,
      tenantId,
      courseOfferingId,
      syllabusVersionId,
      assessmentType,
      blueprintTitle,
      Number(totalMarks),
      Number(durationMinutes),
      status,
      JSON.stringify(sections),
      JSON.stringify(targetTopicIds),
      lecturerId,
      questionIds,
    ]);

    if (!result.rowCount) return NextResponse.json({error:"Blueprint unavailable"}, {status:404});
    logEvent("info", "Faculty saved exam blueprint", { blueprintId, status, lecturerId });

    return NextResponse.json({
      success: true,
      message: submitForReview
        ? "Blueprint drafted and submitted to COE for review."
        : "Blueprint draft saved successfully.",
      blueprint: result.rows[0],
    });
  } catch (error: any) {
    logEvent("error", "Error saving blueprint", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
