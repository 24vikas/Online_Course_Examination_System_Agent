import { CodingQuestionRevisionInputSchema } from "@exam-system/contracts";
import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";
import crypto from "crypto";

export const dynamic = "force-dynamic";

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  const str = typeof val === "object" ? JSON.stringify(val) : String(val);
  return `"${str.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["LECTURER", "COE_ADMIN", "SYSTEM_ADMIN"].includes(authUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const isFacultyOrAdmin = true;

    const { searchParams } = new URL(req.url);
    const courseOfferingId = searchParams.get("courseOfferingId") || undefined;
    const syllabusVersionId = searchParams.get("syllabusVersionId") || undefined;
    const unitNumberParam = searchParams.get("unitNumber");
    const bloomLevel = searchParams.get("bloomLevel");
    const questionType = searchParams.get("questionType");
    const difficulty = searchParams.get("difficulty");
    const reviewStatus = searchParams.get("reviewStatus");
    const search = searchParams.get("search");
    const format = searchParams.get("format") || "json";
    const fileType = searchParams.get("fileType") || "questions";
    const includeAnswerKeys = (searchParams.get("includeAnswerKeys") === "true" || fileType === "answer_keys") && isFacultyOrAdmin;

    // 1. Fetch available course offerings with master courses and syllabus
    const offeringsRes = await queryDb(`
      SELECT 
        co.id as offering_id,
        co.tenant_id,
        co.section,
        mc.course_code,
        mc.course_title,
        sv.id as syllabus_version_id,
        sv.version_tag,
        sv.status as syllabus_status
      FROM course_offerings co
      JOIN master_courses mc ON mc.id = co.master_course_id
      LEFT JOIN subjects sub ON sub.subject_code = mc.course_code
      LEFT JOIN syllabus_versions sv ON sv.subject_id = sub.id AND sv.tenant_id=co.tenant_id
      WHERE co.tenant_id = $1 AND ($2 <> 'LECTURER' OR co.primary_lecturer_id=$3 OR EXISTS (
      SELECT 1 FROM faculty_course_assignments f WHERE f.tenant_id=$1 AND f.course_offering_id=co.id
        AND f.faculty_id=$3 AND f.is_active AND f.role_in_course IN ('PRIMARY_LECTURER','CO_LECTURER')
    ))
      ORDER BY mc.course_code ASC, co.section ASC
    `, [authUser.tenantId, authUser.role, authUser.userId]);

    // 2. Fetch syllabus units, topics, and outcomes
    const unitsRes = await queryDb(`
      SELECT 
        su.id as unit_id,
        su.syllabus_version_id,
        su.unit_number,
        su.title as unit_title,
        st.id as topic_id,
        st.title as topic_title
      FROM syllabus_units su
      LEFT JOIN syllabus_topics st ON st.unit_id = su.id AND st.tenant_id=su.tenant_id
      WHERE su.tenant_id=$1
      ORDER BY su.unit_number ASC, st.title ASC
    `, [authUser.tenantId]);

    const outcomesRes = await queryDb(`
      SELECT id, syllabus_version_id, outcome_code, description, bloom_level
      FROM course_outcomes WHERE tenant_id=$1
      ORDER BY outcome_code ASC
    `, [authUser.tenantId]);

    const scopedOfferings = [...new Set(offeringsRes.rows.map(row => row.offering_id))];
    if (courseOfferingId && !scopedOfferings.includes(courseOfferingId)) {
      return NextResponse.json({error:"Course unavailable"}, {status:404});
    }
    const passages = courseOfferingId && searchParams.get("authoring") === "true" ? await queryDb(
      `SELECT id, syllabus_version_id, page_start, left(content, 600) AS excerpt FROM document_chunks
       WHERE tenant_id=$1 AND course_offering_id=$2 AND is_active_for_retrieval AND embedding IS NOT NULL
       ORDER BY created_at DESC, chunk_index LIMIT 100`, [authUser.tenantId,courseOfferingId]
    ) : null;

    // 3. Build query for question bank
    let sql = `
      SELECT 
        qb.id,
        qb.tenant_id as "tenantId",
        qb.course_offering_id as "courseOfferingId",
        qb.syllabus_version_id as "syllabusVersionId",
        qb.topic_id as "topicId",
        st.title as "topicTitle",
        su.id as "unitId",
        su.unit_number as "unitNumber",
        su.title as "unitTitle",
        qb.course_outcome_id as "courseOutcomeId",
        co.outcome_code as "outcomeCode",
        co.description as "outcomeDescription",
        qb.question_text as "prompt",
        qb.question_type as "questionType",
        qb.options_json as "options",
        qb.marks,
        qb.difficulty,
        qb.bloom_level as "bloomLevel",
        qb.source_locator as "sourceLocator",
        qb.source_excerpt as "sourceExcerpt",
        qb.review_status as "reviewStatus",
        qb.approved_by_lecturer_id as "approvedByLecturerId",
        qb.approved_at as "approvedAt",
        qb.authored_by as "authoredBy",
        qb.created_at as "createdAt",
        mc.course_code as "courseCode",
        mc.course_title as "courseTitle",
        qak.correct_answer as "correctAnswer",
        qak.grading_rubric_json as "gradingRubricJson"
      FROM question_bank qb
      LEFT JOIN syllabus_topics st ON st.id = qb.topic_id
      LEFT JOIN syllabus_units su ON su.id = st.unit_id
      LEFT JOIN course_outcomes co ON co.id = qb.course_outcome_id
      LEFT JOIN course_offerings co_ref ON co_ref.id = qb.course_offering_id
      LEFT JOIN master_courses mc ON mc.id = co_ref.master_course_id
      LEFT JOIN question_answer_keys qak ON qak.question_id = qb.id
      WHERE qb.tenant_id = $1 AND qb.course_offering_id=ANY($2::uuid[])
        AND ($3 <> 'LECTURER' OR qb.authored_by=$4 OR qb.review_status='APPROVED_FOR_QUESTION_BANK')
    `;
    const params: any[] = [authUser.tenantId,scopedOfferings,authUser.role,authUser.userId];

    if (courseOfferingId) {
      params.push(courseOfferingId);
      sql += ` AND qb.course_offering_id = $${params.length}`;
    }

    if (syllabusVersionId) {
      params.push(syllabusVersionId);
      sql += ` AND qb.syllabus_version_id = $${params.length}`;
    }

    if (unitNumberParam) {
      params.push(parseInt(unitNumberParam, 10));
      sql += ` AND su.unit_number = $${params.length}`;
    }

    if (bloomLevel && bloomLevel !== "ALL") {
      params.push(bloomLevel.toUpperCase());
      sql += ` AND qb.bloom_level::text = $${params.length}`;
    }

    if (questionType && questionType !== "ALL") {
      params.push(questionType);
      sql += ` AND qb.question_type = $${params.length}`;
    }

    if (difficulty && difficulty !== "ALL") {
      params.push(difficulty.toUpperCase());
      sql += ` AND qb.difficulty = $${params.length}`;
    }

    if (reviewStatus && reviewStatus !== "ALL") {
      params.push(reviewStatus);
      sql += ` AND qb.review_status::text = $${params.length}`;
    }

    if (search && search.trim()) {
      params.push(`%${search.trim()}%`);
      sql += ` AND (qb.question_text ILIKE $${params.length} OR qb.source_locator ILIKE $${params.length})`;
    }

    sql += ` ORDER BY su.unit_number ASC NULLS LAST, qb.created_at DESC`;

    const questionsRes = await queryDb(sql, params);

    // Format questions
    const rawQuestions = questionsRes.rows.map((row: any) => {
      const rubricJson = row.gradingRubricJson || {};
      const rationale = typeof rubricJson === "object" ? rubricJson.rationale || rubricJson.explanation || "" : "";
      const rubric = typeof rubricJson === "object" ? rubricJson.rubric || "" : "";
      const estimatedTime = typeof rubricJson === "object" && rubricJson.estimatedTimeMinutes ? Number(rubricJson.estimatedTimeMinutes) : (
        row.questionType?.includes("MCQ") || row.questionType === "TRUE_FALSE" ? 2 : row.questionType === "SHORT_ANSWER" ? 5 : 15
      );

      return {
        id: row.id,
        tenantId: row.tenantId,
        courseOfferingId: row.courseOfferingId,
        courseCode: row.courseCode || "26ECAC401",
        courseTitle: row.courseTitle || "Agentic AI",
        syllabusVersionId: row.syllabusVersionId,
        unitId: row.unitId,
        unitNumber: row.unitNumber || 1,
        unitTitle: row.unitTitle || "Unit 1",
        topicId: row.topicId,
        topicTitle: row.topicTitle || "General",
        courseOutcomeId: row.courseOutcomeId,
        outcomeCode: row.outcomeCode || "CO1",
        outcomeDescription: row.outcomeDescription || "",
        prompt: row.prompt,
        questionType: row.questionType,
        options: row.options || [],
        marks: Number(row.marks) || 1.0,
        difficulty: row.difficulty || "MEDIUM",
        bloomLevel: row.bloomLevel || "UNDERSTAND",
        sourceLocator: row.sourceLocator,
        sourceExcerpt: row.sourceExcerpt || "",
        reviewStatus: row.reviewStatus,
        canManageDraft: authUser.role === "LECTURER" && row.authoredBy === authUser.userId && ["DRAFT","REVISION_REQUESTED"].includes(row.reviewStatus),
        canReview: authUser.role !== "LECTURER" && row.reviewStatus === "PENDING_COE_APPROVAL",
        approvedByLecturerId: row.approvedByLecturerId,
        approvedAt: row.approvedAt,
        createdAt: row.createdAt,
        estimatedTime,
        // Quarantined fields only populated when authorized
        correctAnswer: includeAnswerKeys ? (row.correctAnswer || "") : undefined,
        rationale: includeAnswerKeys ? rationale : undefined,
        rubric: includeAnswerKeys ? rubric : undefined,
        gradingRubricJson: includeAnswerKeys ? rubricJson : undefined,
      };
    });

    // 4. Calculate Coverage Matrix
    const byUnit: Record<number, { unitTitle: string; count: number; totalMarks: number; bloomDistribution: Record<string, number>; typeDistribution: Record<string, number> }> = {};
    const byBloom: Record<string, number> = {
      REMEMBER: 0,
      UNDERSTAND: 0,
      APPLY: 0,
      ANALYZE: 0,
      EVALUATE: 0,
      CREATE: 0,
    };
    const byType: Record<string, number> = {};
    const byDifficulty: Record<string, number> = { EASY: 0, MEDIUM: 0, HARD: 0 };
    const byStatus: Record<string, number> = {
      DRAFT: 0,
      APPROVED_FOR_QUESTION_BANK: 0,
      REJECTED: 0,
      REVISION_REQUESTED: 0,
    };
    let totalMarks = 0;

    for (const q of rawQuestions) {
      const uNum = q.unitNumber || 1;
      if (!byUnit[uNum]) {
        byUnit[uNum] = {
          unitTitle: q.unitTitle || `Unit ${uNum}`,
          count: 0,
          totalMarks: 0,
          bloomDistribution: {},
          typeDistribution: {},
        };
      }
      byUnit[uNum].count++;
      byUnit[uNum].totalMarks += q.marks;

      const bl = q.bloomLevel?.toUpperCase() || "UNDERSTAND";
      byUnit[uNum].bloomDistribution[bl] = (byUnit[uNum].bloomDistribution[bl] || 0) + 1;
      byBloom[bl] = (byBloom[bl] || 0) + 1;

      const qt = q.questionType || "MCQ_SINGLE";
      byUnit[uNum].typeDistribution[qt] = (byUnit[uNum].typeDistribution[qt] || 0) + 1;
      byType[qt] = (byType[qt] || 0) + 1;

      const diff = q.difficulty?.toUpperCase() || "MEDIUM";
      byDifficulty[diff] = (byDifficulty[diff] || 0) + 1;

      const st = q.reviewStatus || "DRAFT";
      byStatus[st] = (byStatus[st] || 0) + 1;

      totalMarks += q.marks;
    }

    const coverageMatrix = {
      byUnit,
      byBloom,
      byType,
      byDifficulty,
      byStatus,
      totalQuestions: rawQuestions.length,
      totalMarks: Math.round(totalMarks * 100) / 100,
    };

    // 5. Handle CSV Export
    if (format === "csv") {
      if (fileType === "answer_keys") {
        if (!isFacultyOrAdmin) {
          return new NextResponse("Access Denied: Confidential Answer Keys are restricted to Lecturer and COE Admin.", { status: 403 });
        }

        const headers = [
          "Question ID",
          "Course Code",
          "Unit Number",
          "Topic Title",
          "Bloom Level",
          "Difficulty",
          "Question Type",
          "Marks",
          "Correct Answer",
          "Rationale / Explanation",
          "Grading Rubric Breakdown",
          "Created At",
        ];

        const rows = rawQuestions.map((q) => [
          escapeCsvField(q.id),
          escapeCsvField(q.courseCode),
          escapeCsvField(q.unitNumber),
          escapeCsvField(q.topicTitle),
          escapeCsvField(q.bloomLevel),
          escapeCsvField(q.difficulty),
          escapeCsvField(q.questionType),
          escapeCsvField(q.marks),
          escapeCsvField(q.correctAnswer || ""),
          escapeCsvField(q.rationale || ""),
          escapeCsvField(q.rubric || JSON.stringify(q.gradingRubricJson || {})),
          escapeCsvField(q.createdAt),
        ]);

        const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
        return new Response(csvContent, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="quarantined_answer_keys_${courseOfferingId || "all"}.csv"`,
          },
        });
      } else {
        // Standard Question Bank CSV (Strictly without answers - AUDIT-04 compliance)
        const headers = [
          "Question ID",
          "Course Code",
          "Unit Number",
          "Unit Title",
          "Topic Title",
          "Course Outcome",
          "Bloom Level",
          "Difficulty",
          "Question Type",
          "Marks",
          "Estimated Time (min)",
          "Prompt",
          "Options JSON",
          "Source Locator",
          "Source Excerpt",
          "Review Status",
        ];

        const rows = rawQuestions.map((q) => [
          escapeCsvField(q.id),
          escapeCsvField(q.courseCode),
          escapeCsvField(q.unitNumber),
          escapeCsvField(q.unitTitle),
          escapeCsvField(q.topicTitle),
          escapeCsvField(q.outcomeCode),
          escapeCsvField(q.bloomLevel),
          escapeCsvField(q.difficulty),
          escapeCsvField(q.questionType),
          escapeCsvField(q.marks),
          escapeCsvField(q.estimatedTime),
          escapeCsvField(q.prompt),
          escapeCsvField(JSON.stringify(q.options || [])),
          escapeCsvField(q.sourceLocator),
          escapeCsvField(q.sourceExcerpt),
          escapeCsvField(q.reviewStatus),
        ]);

        const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
        return new Response(csvContent, {
          status: 200,
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": `attachment; filename="question_bank_${courseOfferingId || "all"}.csv"`,
          },
        });
      }
    }

    // Return JSON
    return NextResponse.json({
      success: true,
      questions: rawQuestions,
      coverageMatrix,
      stats: {
        total: rawQuestions.length,
        draft: byStatus.DRAFT || 0,
        approved: byStatus.APPROVED_FOR_QUESTION_BANK || 0,
        rejected: byStatus.REJECTED || 0,
        revisionRequested: byStatus.REVISION_REQUESTED || 0,
      },
      passages: passages?.rows ?? [],
      offerings: offeringsRes.rows.map((o: any) => ({
        offeringId: o.offering_id,
        tenantId: o.tenant_id,
        section: o.section,
        courseCode: o.course_code,
        courseTitle: o.course_title,
        syllabusVersionId: o.syllabus_version_id,
        versionTag: o.version_tag,
        syllabusStatus: o.syllabus_status,
      })),
      syllabusStructure: {
        units: unitsRes.rows,
        outcomes: outcomesRes.rows,
      },
    });
  } catch (error: any) {
    logEvent("error", "Error in lecturer question bank route GET", { error: error.message });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["LECTURER", "COE_ADMIN", "SYSTEM_ADMIN"].includes(authUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const questionsToInsert: any[] = Array.isArray(body.questions) ? body.questions : body.question ? [body.question] : [];

    if (questionsToInsert.length === 0) {
      return NextResponse.json({ success: false, error: "No questions provided to persist." }, { status: 400 });
    }

    const courseOfferingId = body.courseOfferingId || questionsToInsert[0]?.courseOfferingId;
    if (!courseOfferingId) return NextResponse.json({error:"Select a course offering"}, {status:400});

    // Resolve tenant_id and syllabus_version_id for this offering
    const offRes = await queryDb(`
      SELECT co.tenant_id, co.master_course_id, sv.id as syllabus_version_id
      FROM course_offerings co
      JOIN master_courses mc ON mc.id = co.master_course_id
      LEFT JOIN subjects s ON s.subject_code = mc.course_code
      JOIN syllabus_versions sv ON sv.subject_id = s.id AND sv.tenant_id=co.tenant_id
      WHERE co.id = $1 AND co.tenant_id = $2 AND ($3 <> 'LECTURER' OR co.primary_lecturer_id=$4 OR EXISTS (
        SELECT 1 FROM faculty_course_assignments f WHERE f.tenant_id=$2 AND f.course_offering_id=co.id
          AND f.faculty_id=$4 AND f.is_active AND f.role_in_course IN ('PRIMARY_LECTURER','CO_LECTURER')
      ))
      LIMIT 1
    `, [courseOfferingId, authUser.tenantId, authUser.role, authUser.userId]);

    if (!offRes.rowCount) return NextResponse.json({ error: "Course unavailable" }, { status: 404 });
    const tenantId = authUser.tenantId;
    const defaultSyllabusVersionId = offRes.rows[0]?.syllabus_version_id || DEMO_CONFIG.syllabusVersionId;

    const coding = questionsToInsert.find(question=>question?.questionType==="CODING");
    if (coding) {
      if (authUser.role!=="LECTURER") return NextResponse.json({error:"Faculty role required"},{status:403});
      if (questionsToInsert.length!==1) return NextResponse.json({error:"Submit one coding revision per request"},{status:422});
      const payload=CodingQuestionRevisionInputSchema.safeParse(coding.coding);
      const uuid=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
      const {syllabusVersionId,topicId,courseOutcomeId,chunkId,marks,difficulty,bloomLevel}=coding;
      if (!payload.success || ![syllabusVersionId,topicId,courseOutcomeId].every(id=>typeof id==="string" && uuid.test(id)) ||
          (chunkId!=null && (typeof chunkId!=="string" || !uuid.test(chunkId))) ||
          typeof marks!=="number" || !Number.isFinite(marks) || marks<0.5 || marks>100 ||
          !["EASY","MEDIUM","HARD"].includes(difficulty) ||
          !["REMEMBER","UNDERSTAND","APPLY","ANALYZE","EVALUATE","CREATE"].includes(bloomLevel)) {
        return NextResponse.json({error:"Invalid coding problem, tests or syllabus mapping"},{status:422});
      }
      const {publicProblem,hiddenTests}=payload.data;
      const result=await queryDb(`
        WITH draft AS (
          INSERT INTO question_bank(id,tenant_id,course_offering_id,syllabus_version_id,topic_id,
            course_outcome_id,question_text,question_type,marks,difficulty,bloom_level,
            source_locator,source_excerpt,review_status,authored_by)
          SELECT $1,$2,co.id,sv.id,t.id,o.id,$8,'CODING',$9,$10,$11::bloom_level_type,
            CASE WHEN c.id IS NULL THEN 'Faculty-authored coding problem' ELSE 'document:'||c.document_id||'/chunk:'||c.id END,
            COALESCE(left(c.content,1000),''),'DRAFT',$12
          FROM course_offerings co JOIN master_courses mc ON mc.id=co.master_course_id
          JOIN subjects sub ON sub.subject_code=mc.course_code
          JOIN syllabus_versions sv ON sv.id=$4 AND sv.subject_id=sub.id AND sv.tenant_id=$2
          JOIN syllabus_units u ON u.syllabus_version_id=sv.id AND u.tenant_id=$2
          JOIN syllabus_topics t ON t.id=$5 AND t.unit_id=u.id AND t.tenant_id=$2
          JOIN course_outcomes o ON o.id=$6 AND o.syllabus_version_id=sv.id AND o.tenant_id=$2
          LEFT JOIN document_chunks c ON c.id=$7 AND c.tenant_id=$2 AND c.course_offering_id=co.id AND c.syllabus_version_id=sv.id
            AND c.is_active_for_retrieval AND c.embedding IS NOT NULL
          WHERE co.id=$3 AND co.tenant_id=$2 AND ($7::uuid IS NULL OR c.id IS NOT NULL)
            AND (co.primary_lecturer_id=$12 OR EXISTS (SELECT 1 FROM faculty_course_assignments f
              WHERE f.tenant_id=$2 AND f.course_offering_id=co.id AND f.faculty_id=$12 AND f.is_active
                AND f.role_in_course IN ('PRIMARY_LECTURER','CO_LECTURER')))
          RETURNING tenant_id,id
        ), revision AS (
          INSERT INTO coding_problem_revisions(tenant_id,question_id,public_problem)
          SELECT tenant_id,id,$13 FROM draft RETURNING tenant_id,question_id,revision_id
        )
        INSERT INTO coding_hidden_test_sets(tenant_id,question_id,revision_id,hidden_tests)
        SELECT tenant_id,question_id,revision_id,$14 FROM revision RETURNING question_id,revision_id`,
        [crypto.randomUUID(),tenantId,courseOfferingId,syllabusVersionId,topicId,courseOutcomeId,chunkId??null,
          publicProblem.statement,marks,difficulty,bloomLevel,authUser.userId,JSON.stringify(publicProblem),JSON.stringify(hiddenTests)]
      );
      if (!result.rowCount) return NextResponse.json({error:"Coding course or citation unavailable"},{status:422});
      return NextResponse.json({success:true,persistedCount:1,questionIds:[result.rows[0].question_id],revisionId:result.rows[0].revision_id});
    }

    const insertedIds: string[] = [];

    for (const q of questionsToInsert) {
      const qId = q.id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(q.id)
        ? q.id
        : crypto.randomUUID();

      const syllabusVersionId = q.syllabusVersionId || defaultSyllabusVersionId;
      const topicId = q.topicId;
      const courseOutcomeId = q.courseOutcomeId || null;
      const questionText = q.prompt || q.questionText || "";
      const questionType = q.questionType || (q.type === "mcq" ? "MCQ_SINGLE" : "SHORT_ANSWER");
      const optionsJson = JSON.stringify(q.options || []);
      const marks = Number(q.marks ?? q.suggestedMarks);
      const difficulty = (q.difficulty || "MEDIUM").toUpperCase();
      const bloomLevel = (q.bloomLevel || "UNDERSTAND").toUpperCase();
      const chunkId = q.chunkId || q.sourceChunkId || q.sourceChunkCitation?.chunkId;
      const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
      if (![chunkId, topicId, courseOutcomeId, syllabusVersionId].every(value => typeof value === "string" && uuid.test(value))) {
        return NextResponse.json({error:"Select a syllabus passage, topic and course outcome"}, {status:422});
      }
      if (!["REMEMBER","UNDERSTAND","APPLY","ANALYZE","EVALUATE","CREATE"].includes(bloomLevel)) {
        return NextResponse.json({error:"Invalid Bloom taxonomy level"}, {status:422});
      }
      const source = await queryDb(
        `SELECT c.id, c.document_id, c.page_start, c.content
           FROM document_chunks c
           JOIN syllabus_topics t ON t.id=$5 AND t.tenant_id=c.tenant_id
           JOIN syllabus_units u ON u.id=t.unit_id AND u.tenant_id=c.tenant_id AND u.syllabus_version_id=c.syllabus_version_id
           JOIN course_outcomes o ON o.id=$6 AND o.tenant_id=c.tenant_id AND o.syllabus_version_id=c.syllabus_version_id
          WHERE c.id=$1 AND c.tenant_id=$2 AND c.course_offering_id=$3 AND c.syllabus_version_id=$4
            AND c.is_active_for_retrieval AND c.embedding IS NOT NULL`,
        [chunkId,tenantId,courseOfferingId,syllabusVersionId,topicId,courseOutcomeId]
      );
      if (!source.rowCount) return NextResponse.json({error:"Passage or syllabus mapping unavailable"}, {status:422});
      const chunk = source.rows[0];
      const sourceLocator = `document:${chunk.document_id}/chunk:${chunk.id}/page:${chunk.page_start ?? "unknown"}`;
      const sourceExcerpt = chunk.content.slice(0, 1000);
      const reviewStatus = "DRAFT";

      const correctAnswer = typeof q.correctAnswer === "string" ? q.correctAnswer.trim() : "";
      if (!correctAnswer || !questionText.trim() || !Number.isFinite(marks) || marks <= 0) {
        return NextResponse.json({error:"Question text, an explicit answer key, and positive marks are required"}, {status:422});
      }
      const rubricJson = JSON.stringify({
        rationale: q.rationale || q.explanation || "",
        rubric: q.rubric || "",
      });
      const inserted = await queryDb(`
        WITH draft AS (
          INSERT INTO question_bank (
            id, tenant_id, course_offering_id, syllabus_version_id, topic_id,
            course_outcome_id, question_text, question_type, options_json,
            correct_answer, marks, difficulty, bloom_level, source_locator,
            source_excerpt, review_status, created_at, authored_by
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10, $11,
            $12::bloom_level_type, $13, $14, $15::question_review_status_type, NOW(), $18
          )
          ON CONFLICT (id) DO NOTHING
          RETURNING id, tenant_id
        )
        INSERT INTO question_answer_keys (tenant_id, question_id, correct_answer, grading_rubric_json, created_at)
        SELECT tenant_id, id, $16, $17, NOW() FROM draft
      `, [
        qId, tenantId, courseOfferingId, syllabusVersionId, topicId,
        courseOutcomeId, questionText, questionType, optionsJson,
        marks, difficulty, bloomLevel, sourceLocator,
        sourceExcerpt, reviewStatus, correctAnswer, rubricJson, authUser.userId,
      ]);
      if (!inserted.rowCount) return NextResponse.json({error:"Question identifier already exists"}, {status:409});

      insertedIds.push(qId);
    }

    logEvent("info", "Persisted questions into question_bank with quarantined answer keys", {
      count: insertedIds.length,
      courseOfferingId,
      actorRole: authUser.role,
    });

    return NextResponse.json({
      success: true,
      persistedCount: insertedIds.length,
      questionIds: insertedIds,
      message: `Successfully persisted ${insertedIds.length} grounded questions to question_bank with answer keys quarantined in question_answer_keys.`,
    });
  } catch (error: any) {
    logEvent("error", "Error in lecturer question bank route POST", { code: error.code });
    return NextResponse.json({ success: false, error: "Could not save question" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["LECTURER", "COE_ADMIN", "SYSTEM_ADMIN"].includes(authUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { questionId, action, notes, modifiedText, modifiedBloom, modifiedMarks, modifiedAnswerKey, modifiedRationale } = body;

    if (!questionId) {
      return NextResponse.json({ success: false, error: "Missing required parameter: questionId." }, { status: 400 });
    }

    if (action === "SUBMIT_FOR_REVIEW" || action === "EDIT_DRAFT") {
      if (authUser.role !== "LECTURER") return NextResponse.json({error:"Forbidden"}, {status:403});
      const editing = action === "EDIT_DRAFT";
      const text = typeof modifiedText === "string" ? modifiedText.trim() : "";
      if (editing && (!text || text.length > 10000)) {
        return NextResponse.json({error:"Enter question text between 1 and 10,000 characters"}, {status:422});
      }
      const submitted = await queryDb(
        `UPDATE question_bank q SET question_text=CASE WHEN $4 THEN $5 ELSE q.question_text END,
          review_status=CASE WHEN $4 THEN q.review_status ELSE 'PENDING_COE_APPROVAL'::question_review_status_type END,
          submitted_for_review_at=CASE WHEN $4 THEN q.submitted_for_review_at ELSE clock_timestamp() END
          FROM course_offerings co
         WHERE q.id=$1 AND q.tenant_id=$2 AND q.authored_by=$3 AND q.review_status IN ('DRAFT','REVISION_REQUESTED')
           AND co.id=q.course_offering_id AND co.tenant_id=$2 AND
           (co.primary_lecturer_id=$3 OR EXISTS (
             SELECT 1 FROM faculty_course_assignments f WHERE f.tenant_id=$2 AND f.course_offering_id=co.id
               AND f.faculty_id=$3 AND f.is_active AND f.role_in_course IN ('PRIMARY_LECTURER','CO_LECTURER')
           )) RETURNING q.review_status`, [questionId,authUser.tenantId,authUser.userId,editing,text]
      );
      return submitted.rowCount ? NextResponse.json({success:true,reviewStatus:submitted.rows[0].review_status}) :
        NextResponse.json({error:"Draft unavailable"}, {status:404});
    }
    if (authUser.role === "LECTURER") return NextResponse.json({error:"Forbidden"}, {status:403});
    const question = await queryDb("SELECT question_type FROM question_bank WHERE id = $1 AND tenant_id = $2 AND review_status = 'PENDING_COE_APPROVAL'", [questionId, authUser.tenantId]);
    if (!question.rowCount) return NextResponse.json({ error: "Question unavailable" }, { status: 404 });
    if (action === "APPROVE") {
      await queryDb(`
        UPDATE question_bank
        SET 
          review_status = 'APPROVED_FOR_QUESTION_BANK',
          approved_by_lecturer_id = $1,
          approved_at = NOW(),
          question_text = COALESCE($2, question_text),
          bloom_level = COALESCE($3::bloom_level_type, bloom_level),
          marks = COALESCE($4, marks)
        WHERE id = $5
      `, [authUser?.userId || DEMO_CONFIG.users.lecturer.id, modifiedText || null, modifiedBloom || null, modifiedMarks || null, questionId]);

      if (modifiedAnswerKey) {
        await queryDb(`
          UPDATE question_answer_keys
          SET correct_answer = $1
          WHERE question_id = $2
        `, [modifiedAnswerKey, questionId]);
      }
    } else if (action === "REJECT") {
      await queryDb(`
        UPDATE question_bank
        SET review_status = 'REJECTED'
        WHERE id = $1
      `, [questionId]);
    } else if (action === "REQUEST_REVISION") {
      await queryDb(`
        UPDATE question_bank
        SET review_status = 'REVISION_REQUESTED'
        WHERE id = $1
      `, [questionId]);
    } else {
      // General Update
      await queryDb(`
        UPDATE question_bank
        SET 
          question_text = COALESCE($1, question_text),
          bloom_level = COALESCE($2::bloom_level_type, bloom_level),
          marks = COALESCE($3, marks)
        WHERE id = $4
      `, [modifiedText || null, modifiedBloom || null, modifiedMarks || null, questionId]);

      if (modifiedAnswerKey || modifiedRationale) {
        await queryDb(`
          UPDATE question_answer_keys
          SET 
            correct_answer = COALESCE($1, correct_answer),
            grading_rubric_json = jsonb_set(
              grading_rubric_json, 
              '{rationale}', 
              to_jsonb(COALESCE($2, grading_rubric_json->>'rationale'))
            )
          WHERE question_id = $3
        `, [modifiedAnswerKey || null, modifiedRationale || null, questionId]);
      }
    }

    return NextResponse.json({
      success: true,
      message: `Question ${questionId} updated with action ${action || "UPDATE"}.`,
    });
  } catch (error: any) {
    logEvent("error", "Error in lecturer question bank route PATCH", { error: error.message });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["LECTURER", "COE_ADMIN", "SYSTEM_ADMIN"].includes(authUser.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const questionId = searchParams.get("id");

    if (!questionId) {
      return NextResponse.json({ success: false, error: "Missing required query param: id" }, { status: 400 });
    }

    const deleted = await queryDb(
      `DELETE FROM question_bank WHERE id=$1 AND tenant_id=$2 AND authored_by=$3 AND review_status='DRAFT'`,
      [questionId,authUser.tenantId,authUser.userId]
    );
    if (!deleted.rowCount) return NextResponse.json({error:"Draft unavailable"}, {status:404});

    return NextResponse.json({
      success: true,
      message: `Question ${questionId} and associated quarantined answer keys successfully deleted.`,
    });
  } catch (error: any) {
    logEvent("error", "Error in lecturer question bank route DELETE", { error: error.message });
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
