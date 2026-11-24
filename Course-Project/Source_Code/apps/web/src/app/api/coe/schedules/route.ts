import { NextRequest, NextResponse } from "next/server";
import { getDbPool, queryDb } from "@/lib/db";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (authUser.role !== "COE_ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
    const tenantId = authUser.tenantId;

    const result = await queryDb(`
      SELECT 
        es.id as schedule_id,
        es.title as exam_title,
        es.start_time,
        es.end_time,
        es.duration_minutes,
        es.status,
        es.published_at,
        eb.id as blueprint_id,
        eb.title as blueprint_title,
        eb.status as blueprint_status,
        mc.course_code,
        mc.course_title,
        co.section,
        (SELECT count(*) FROM exam_registrations r WHERE r.tenant_id=es.tenant_id AND r.schedule_id=es.id) AS registered_candidates_count,
        (SELECT count(*) FROM exam_schedule_candidates r WHERE r.tenant_id=es.tenant_id AND r.schedule_id=es.id) AS assigned_candidates_count,
        es.invigilator_membership_id
      FROM exam_schedules es
      JOIN exam_blueprints eb ON eb.id = es.blueprint_id
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE es.tenant_id = $1
      ORDER BY es.created_at DESC
    `, [tenantId]);

    const invigilators = await queryDb(
      `SELECT tm.id,u.email FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
       WHERE tm.tenant_id=$1 AND tm.role='INVIGILATOR' ORDER BY u.email`,[tenantId]
    );
    return NextResponse.json({
      invigilators:invigilators.rows,
      success: true,
      totalSchedules: result.rows.length,
      schedules: result.rows.map((r: any) => ({
        id: r.schedule_id,
        title: r.exam_title,
        courseCode: r.course_code,
        courseTitle: r.course_title,
        section: r.section,
        blueprintId: r.blueprint_id,
        blueprintTitle: r.blueprint_title,
        blueprintStatus: r.blueprint_status,
        startTime: r.start_time,
        endTime: r.end_time,
        durationMinutes: r.duration_minutes,
        status: r.status,
        assignedCandidatesCount: Number(r.assigned_candidates_count),
        invigilatorMembershipId:r.invigilator_membership_id,
        registeredCandidatesCount: Number(r.registered_candidates_count),
        publishedAt: r.published_at,
      })),
    });
  } catch (error: any) {
    logEvent("error", "Error fetching exam schedules", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser || authUser.role !== "COE_ADMIN") {
      return NextResponse.json({ error: "Forbidden: Only COE_ADMIN can schedule exams" }, { status: 403 });
    }
    const tenantId = authUser.tenantId;
    const coeAdminId = authUser.userId;

    const body = await req.json().catch(() => ({}));
    const {
      blueprintId, invigilatorMembershipId,
      title,
      startTime,
      endTime,
      cameraRequired = true,
      fullscreenRequired = true,
      sebRequired = false,
    } = body;

    if (!blueprintId || !invigilatorMembershipId) {
      return NextResponse.json({ error: "Choose an approved blueprint and an invigilator" }, { status: 400 });
    }

    if (typeof startTime !== "string" || typeof endTime !== "string" ||
        !/(Z|[+-]\d{2}:\d{2})$/i.test(startTime) || !/(Z|[+-]\d{2}:\d{2})$/i.test(endTime)) {
      return NextResponse.json({error:"Start and end times must include a timezone"}, {status:422});
    }
    const startWindow=new Date(startTime);
    const endWindow=new Date(endTime);
    if (!Number.isFinite(+startWindow) || !Number.isFinite(+endWindow) || endWindow<=startWindow) {
      return NextResponse.json({error:"Invalid exam window"}, {status:422});
    }
    const db=await getDbPool().connect();
    let committed=false;
    try {
      await db.query("BEGIN");
      const {rows:[bp]}=await db.query(
        `SELECT id,course_offering_id,title,status,duration_minutes,sections_json,total_marks,syllabus_version_id,clock_timestamp() AS server_now
           FROM exam_blueprints WHERE id=$1 AND tenant_id=$2 FOR UPDATE`,[blueprintId,tenantId]
      );
      if (!bp) return NextResponse.json({error:"Blueprint not found"}, {status:404});
      if (bp.status!=="APPROVED") return NextResponse.json({error:"Approve the blueprint before scheduling"}, {status:409});
      const scheduleDuration=body.durationMinutes ?? bp.duration_minutes;
      if (!Number.isInteger(scheduleDuration) || scheduleDuration<5 || scheduleDuration>360 ||
          +startWindow<=+new Date(bp.server_now) || +endWindow-+startWindow<scheduleDuration*60000) {
        return NextResponse.json({error:"Choose a future window that fits the exam duration"}, {status:422});
      }
      const existing=await db.query("SELECT id FROM exam_schedules WHERE tenant_id=$1 AND blueprint_id=$2",[tenantId,blueprintId]);
      if (existing.rowCount) return NextResponse.json({error:"A timetable already exists for this blueprint"}, {status:409});
      const sections = Array.isArray(bp.sections_json) ? bp.sections_json : [];
      const questionIds:string[] = sections.flatMap(section => Array.isArray(section.questionIds) ? section.questionIds : []);
      if (!sections.length || sections.some(section=>!Array.isArray(section.questionIds) || !section.questionIds.length) ||
          new Set(questionIds).size!==questionIds.length) {
        return NextResponse.json({error:"Every paper section needs distinct approved questions"}, {status:422});
      }
      const paper=await db.query(
        `SELECT q.id,q.question_text,q.question_type,q.options_json,q.marks,q.bloom_level,q.difficulty,
                k.correct_answer,k.grading_rubric_json,
                cpr.public_problem,
                chts.hidden_tests
           FROM question_bank q
           LEFT JOIN question_answer_keys k ON k.question_id=q.id AND k.tenant_id=q.tenant_id
           LEFT JOIN LATERAL (
             SELECT public_problem, revision_id
               FROM coding_problem_revisions
              WHERE tenant_id=q.tenant_id AND question_id=q.id
              ORDER BY created_at DESC LIMIT 1
           ) cpr ON q.question_type='CODING'
           LEFT JOIN coding_hidden_test_sets chts
             ON chts.tenant_id=q.tenant_id AND chts.question_id=q.id AND chts.revision_id=cpr.revision_id
          WHERE q.id=ANY($1::uuid[]) AND q.tenant_id=$2 AND q.course_offering_id=$3
            AND q.syllabus_version_id=$4 AND q.review_status='APPROVED_FOR_QUESTION_BANK'
            AND (
              (q.question_type <> 'CODING' AND NULLIF(trim(k.correct_answer),'') IS NOT NULL)
              OR
              (q.question_type = 'CODING' AND cpr.public_problem IS NOT NULL)
            )
          ORDER BY q.id`,
        [questionIds,tenantId,bp.course_offering_id,bp.syllabus_version_id]
      );
      if (paper.rowCount!==questionIds.length) {
        return NextResponse.json({error:"The paper contains unavailable or unapproved questions"}, {status:409});
      }
      const questionsById = new Map<string, any>(paper.rows.map(question => [question.id, question]));
      const sectionTotals = sections.map(section => section.questionIds.reduce((sum: number, id: string) => sum + Number((questionsById.get(id) as any)?.marks || 0), 0));
      if (sections.some((section,index)=>Math.abs(Number(section.marks)-sectionTotals[index])>0.000001) ||
          Math.abs(sectionTotals.reduce((sum,total)=>sum+total,0)-Number(bp.total_marks))>0.000001) {
        return NextResponse.json({error:"Approved question marks no longer match the blueprint"}, {status:409});
      }
      const answerKeys:Record<string,unknown>={};
      const questions=sections.flatMap(section=>section.questionIds.map((id:string)=>{
        const q=questionsById.get(id);
        if (q.question_type === "CODING") {
          answerKeys[id] = {
            hiddenTests: q.hidden_tests || [],
            scoring: q.public_problem?.scoring || "weighted",
            timeLimitMs: q.public_problem?.timeLimitMs || 2000,
            memoryLimitKiB: q.public_problem?.memoryLimitKiB || 65536,
          };
          return {
            id,
            section: section.name,
            question_text: q.question_text,
            question_type: q.question_type,
            marks: Number(q.marks),
            bloom_level: q.bloom_level,
            difficulty: q.difficulty,
            public_problem: q.public_problem,
          };
        } else {
          answerKeys[id] = { correctAnswer: q.correct_answer, rubric: q.grading_rubric_json };
          return {
            id,
            section: section.name,
            question_text: q.question_text,
            question_type: q.question_type,
            options_json: Array.isArray(q.options_json) ? q.options_json.flatMap((option: unknown) => {
              if (typeof option === "string") return [option];
              if (option && typeof option === "object" && "text" in option && typeof option.text === "string") {
                return ["key" in option && typeof option.key === "string" ? { key: option.key, text: option.text } : { text: option.text }];
              }
              return [];
            }) : [],
            marks: Number(q.marks),
            bloom_level: q.bloom_level,
            difficulty: q.difficulty,
          };
        }
      }));
      const invigilator=await db.query(
        "SELECT id FROM tenant_memberships WHERE id=$1 AND tenant_id=$2 AND role='INVIGILATOR' FOR SHARE",
        [invigilatorMembershipId,tenantId]
      );
      if (!invigilator.rowCount) return NextResponse.json({error:"Invigilator unavailable"},{status:404});
      const scheduleId=crypto.randomUUID();
      const scheduleTitle=typeof title==="string" && title.trim() ? title.trim():bp.title;
      const {rows:[schedule]}=await db.query(
        `INSERT INTO exam_schedules(id,tenant_id,blueprint_id,course_offering_id,title,
          start_time,end_time,duration_minutes,status,published_by,published_at,invigilator_membership_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'SCHEDULED',$9,clock_timestamp(),$10) RETURNING *`,
        [scheduleId,tenantId,blueprintId,bp.course_offering_id,scheduleTitle,startWindow,endWindow,scheduleDuration,coeAdminId,invigilatorMembershipId]
      );
      const assigned=await db.query(
        `INSERT INTO exam_schedule_candidates(schedule_id,tenant_id,student_id)
         SELECT DISTINCT $1::uuid,en.tenant_id,en.student_id FROM enrollments en
          JOIN students st ON st.id=en.student_id AND st.tenant_id=en.tenant_id AND st.is_active
         WHERE en.tenant_id=$2::uuid AND en.course_offering_id=$3::uuid AND en.enrollment_status='ENROLLED'`,
        [scheduleId,tenantId,bp.course_offering_id]
      );
      if (!assigned.rowCount) return NextResponse.json({error:"No active enrolled candidates for this offering"},{status:422});
      await db.query("INSERT INTO exam_paper_snapshots(schedule_id,tenant_id,questions) VALUES ($1::uuid,$2::uuid,$3)",
        [scheduleId,tenantId,JSON.stringify(questions)]);
      await db.query("INSERT INTO exam_paper_answer_keys(schedule_id,answer_keys) VALUES ($1::uuid,$2)",
        [scheduleId,JSON.stringify(answerKeys)]);
      await db.query(
        `INSERT INTO exam_proctoring_configs(tenant_id,exam_schedule_id,camera_required,fullscreen_required,seb_required,consent_text)
         VALUES ($1::uuid,$2::uuid,$3,$4,$5,'I agree to adhere to the institutional academic honor code during this examination.')`,
        [tenantId,scheduleId,cameraRequired===true,fullscreenRequired===true,sebRequired===true]
      );
      await db.query(
        `INSERT INTO audit_events(id,tenant_id,user_id,action,resource_type,resource_id,metadata_json)
         VALUES ($1::uuid,$2::uuid,$3::uuid,'EXAM_SCHEDULE_PUBLISHED','EXAM_SCHEDULE',$4,$5)`,
        [crypto.randomUUID(),tenantId,coeAdminId,scheduleId,JSON.stringify({blueprintId,startTime,endTime})]
      );
      await db.query("COMMIT");
      committed=true;
      return NextResponse.json({success:true,schedule,assignedCandidatesCount:assigned.rowCount});
    } finally {
      try { if (!committed) await db.query("ROLLBACK"); } finally { db.release(); }
    }
  } catch(error) {
    logEvent("error","Error creating exam schedule",{error:(error as Error).message});
    return NextResponse.json({error:"Could not publish timetable"},{status:500});
  }
}
