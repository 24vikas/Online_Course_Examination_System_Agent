import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertAuthorized } from "@/lib/auth";
import { queryDb } from "@/lib/db";

export const dynamic = "force-dynamic";

async function handle(req: NextRequest, write: boolean) {
  const auth = await assertAuthorized(req, ["STUDENT"]);
  if ("errorResponse" in auth) return auth.errorResponse;
  const { tenantId, userId, membershipId } = auth.user;
  const body = write ? z.object({scheduleId:z.string().uuid()}).strict().safeParse(await req.json().catch(()=>null)) : null;
  if (body && !body.success) return NextResponse.json({error:"Invalid registration"}, {status:400});
  const target = body?.data?.scheduleId ?? null;
  const profile = await queryDb(`SELECT s.id, s.institutional_student_id AS usn, concat_ws(' ',s.first_name,s.last_name) AS name,
      coalesce(s.current_semester,s.semester) AS semester,s.branch FROM students s JOIN aura_password_credentials c ON c.student_id=s.id
      WHERE c.membership_id=$1 AND s.tenant_id=$2 AND s.is_active`,[membershipId,tenantId]);
  if (!profile.rowCount) return NextResponse.json({error:"Student unavailable"},{status:403});
  const student = profile.rows[0];
  const result = await queryDb(`SELECT co.id AS offering,mc.course_code AS code,mc.course_title AS course,
      es.id AS schedule,es.title,es.start_time,es.end_time, es.end_time > clock_timestamp() AS open,
      snap.id AS snapshot,snap.decision AS snap_decision,snap.allow AS snap_allow,snap.evidence_snapshot AS evidence,r.registered_at,ea.status AS attempt_status
    FROM enrollments en JOIN course_offerings co ON co.id=en.course_offering_id AND co.tenant_id=en.tenant_id
    JOIN master_courses mc ON mc.id=co.master_course_id
    LEFT JOIN exam_schedules es ON es.course_offering_id=co.id AND es.tenant_id=en.tenant_id AND es.published_at IS NOT NULL AND es.status='SCHEDULED'
      AND (es.invigilator_membership_id IS NULL OR EXISTS (
        SELECT 1 FROM exam_schedule_candidates r WHERE r.schedule_id=es.id AND r.tenant_id=en.tenant_id AND r.student_id=en.student_id
      ))
    LEFT JOIN exam_registrations r ON r.schedule_id=es.id AND r.student_id=en.student_id AND r.tenant_id=en.tenant_id
    LEFT JOIN LATERAL (SELECT status FROM exam_attempts WHERE tenant_id=$1 AND exam_schedule_id=es.id AND student_id=$3 ORDER BY created_at DESC LIMIT 1) ea ON true
    LEFT JOIN LATERAL (SELECT id,decision,allow,evidence_snapshot FROM eligibility_snapshots WHERE tenant_id=$1 AND (student_id=$3 OR student_id=$2) AND course_offering_id=co.id ORDER BY evaluated_at DESC,id DESC LIMIT 1) snap ON true
    WHERE en.tenant_id=$1 AND en.student_id=$2 AND en.enrollment_status='ENROLLED' AND ($4::uuid IS NULL OR es.id=$4)
    ORDER BY (es.end_time > clock_timestamp()) DESC, es.start_time DESC, mc.course_code`,[tenantId,student.id,userId,target]);
  const courses = [];
  for (const row of result.rows) {
    const rawEvidence = (row.evidence && typeof row.evidence === "object") ? row.evidence : {};
    const attendance = rawEvidence.attendance_percentage ?? rawEvidence.attendancePercentage ?? rawEvidence.attendanceRate ?? null;
    const fees = rawEvidence.fee_cleared ?? rawEvidence.feeCleared ?? null;
    const disciplinary = rawEvidence.disciplinary_hold ?? rawEvidence.disciplinaryHold ?? false;
    const prerequisites = rawEvidence.prerequisites_satisfied ?? rawEvidence.prerequisitesSatisfied ?? true;
    const medical = rawEvidence.medical_exemption_approved ?? rawEvidence.medicalExemptionApproved ?? false;
    const enrolled = rawEvidence.enrolled ?? true;
    const rawSource = rawEvidence.source;
    const source = rawSource ?? (row.snapshot ? "VERIFIED" : "UNAVAILABLE");
    const trusted = source === "VERIFIED" || source === "DEMO" || (Boolean(row.snapshot));

    let decision = row.snap_decision || "PENDING_VERIFICATION";

    if (trusted && attendance != null && fees != null) {
      try {
        const opaUrl = (process.env.OPA_URL || "http://127.0.0.1:18181") + "/v1/data/exam/eligibility/evaluation_result";
        const opaPayload = {
          input: {
            tenant_id: tenantId,
            student_id: userId,
            course_offering_id: row.offering,
            evidence: {
              tenant_id: tenantId,
              enrolled: Boolean(enrolled),
              attendance_percentage: Number(attendance),
              fee_cleared: Boolean(fees),
              prerequisites_satisfied: Boolean(prerequisites),
              disciplinary_hold: Boolean(disciplinary),
              medical_exemption_approved: Boolean(medical),
            }
          }
        };
        const response = await fetch(opaUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(2500),
          body: JSON.stringify(opaPayload)
        });
        if (response.ok) {
          const verdict = (await response.json()).result;
          if (verdict?.allow === true && verdict?.decision === "ELIGIBLE") decision = "ELIGIBLE";
          else if (verdict?.decision === "INELIGIBLE") decision = "INELIGIBLE";
        }
      } catch {
        if (row.snap_decision === "ELIGIBLE" && row.snap_allow) decision = "ELIGIBLE";
      }
    } else if (row.snap_decision === "ELIGIBLE" && row.snap_allow) {
      decision = "ELIGIBLE";
    }

    if (write) {
      if (decision !== "ELIGIBLE" || !row.open) return NextResponse.json({error:"Registration unavailable"},{status:403});
      const saved = await queryDb(`INSERT INTO exam_registrations(tenant_id,student_id,schedule_id,eligibility_snapshot_id)
        SELECT $1,$2,es.id,$4 FROM exam_schedules es JOIN enrollments en ON en.course_offering_id=es.course_offering_id AND en.tenant_id=es.tenant_id
        WHERE es.tenant_id=$1 AND en.student_id=$2 AND es.id=$3 AND es.status='SCHEDULED' AND es.published_at IS NOT NULL
        AND (es.invigilator_membership_id IS NULL OR EXISTS (
          SELECT 1 FROM exam_schedule_candidates r WHERE r.schedule_id=es.id AND r.tenant_id=$1 AND r.student_id=$2
        ))
        AND es.end_time>clock_timestamp() AND en.enrollment_status='ENROLLED' AND $4::uuid=(SELECT id FROM eligibility_snapshots
          WHERE tenant_id=$1 AND (student_id=$5 OR student_id=$2) AND course_offering_id=es.course_offering_id ORDER BY evaluated_at DESC,id DESC LIMIT 1)
        ON CONFLICT (tenant_id,student_id,schedule_id) DO UPDATE SET eligibility_snapshot_id=EXCLUDED.eligibility_snapshot_id RETURNING registered_at`,
        [tenantId,student.id,target,row.snapshot,userId]);
      return NextResponse.json(saved.rowCount ? {registered:true} : {error:"Eligibility changed"},{status:saved.rowCount?200:409});
    }
    courses.push({code:row.code,course:row.course,schedule:row.schedule,title:row.title,start:row.start_time,end:row.end_time,
      decision,source:trusted?source:"UNAVAILABLE",attendance:attendance!=null?Number(attendance):null,
      fees:fees!=null?Boolean(fees):null,registered:!!row.registered_at,open:row.open,attempt:row.attempt_status});
  }
  return write ? NextResponse.json({error:"Schedule unavailable"},{status:404}) : NextResponse.json({student,courses});
}
export const GET = (req:NextRequest) => handle(req,false);
export const POST = (req:NextRequest) => handle(req,true);
