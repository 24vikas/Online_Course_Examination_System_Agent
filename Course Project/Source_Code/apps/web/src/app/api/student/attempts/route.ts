import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { resolveAuth } from "../../../../lib/auth";
import { logEvent } from "../../../../lib/logger";
import { assertProctoredAttemptActive, AuraProctorAuthorizationError } from "../../../../lib/proctoring/proctorAuthorization";
import crypto from "crypto";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;
    const { searchParams } = new URL(req.url);
    const requestedStudent = searchParams.get("studentId");
    if (requestedStudent && requestedStudent !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const paramScheduleId = searchParams.get("scheduleId");
    const paramAttemptId = searchParams.get("attemptId");

    // 1. Fetch available scheduled exams
    let scheduleQuery = `
      SELECT 
        es.id,
        es.id as "scheduleId",
        es.title,
        es.duration_minutes as "durationMinutes",
        es.start_time as "startTime",
        es.end_time as "endTime",
        es.status,
        es.course_offering_id as "courseOfferingId",
        mc.course_code as "courseCode",
        mc.course_title as "courseTitle"
      FROM exam_schedules es
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      WHERE es.tenant_id = $1
    `;
    const scheduleParams: any[] = [tenantId];

    if (paramScheduleId) {
      scheduleQuery += ` AND es.id = $2`;
      scheduleParams.push(paramScheduleId);
    }

    scheduleQuery += `
      ORDER BY 
        CASE WHEN es.id = 'dddddddd-dddd-dddd-dddd-dddddddddddd' THEN 0 ELSE 1 END,
        es.created_at DESC
      LIMIT 1
    `;

    const scheduleRes = await queryDb(scheduleQuery, scheduleParams);

    const activeSchedule = scheduleRes.rows[0];
    if (!activeSchedule) return NextResponse.json({ error: "Schedule unavailable" }, { status: 404 });

    // 2. Fetch student attempt (matching paramAttemptId or latest for student)
    let latestAttempt: any = null;
    if (paramAttemptId) {
      const specificAttemptRes = await queryDb(`
        SELECT id, status, server_start_time, server_deadline, submitted_at,
               objective_score, total_score, max_marks, exam_schedule_id
        FROM exam_attempts
        WHERE tenant_id = $1 AND id = $2 AND student_id = $3
        LIMIT 1
      `, [tenantId, paramAttemptId, studentId]);
      if (!specificAttemptRes.rowCount) return NextResponse.json({ error: "Attempt unavailable" }, { status: 404 });
      latestAttempt = specificAttemptRes.rows[0];
    }

    if (!latestAttempt) {
      const attemptRes = await queryDb(`
        SELECT id, status, server_start_time, server_deadline, submitted_at,
               objective_score, total_score, max_marks, exam_schedule_id
        FROM exam_attempts
        WHERE tenant_id = $1 AND student_id = $2
        ORDER BY created_at DESC
        LIMIT 1
      `, [tenantId, studentId]);
      latestAttempt = attemptRes.rows[0] || null;
    }

    // 3. Fetch questions: First check immutable published snapshot (AUDIT-04: strictly conceal answer keys!)
    let questions: any[] = [];
    const targetScheduleId = latestAttempt?.exam_schedule_id || activeSchedule.id || activeSchedule.scheduleId;
    const snapshotRes = await queryDb(
      `SELECT questions FROM exam_paper_snapshots WHERE schedule_id = $1 AND tenant_id = $2 LIMIT 1`,
      [targetScheduleId, tenantId]
    );

    if (snapshotRes.rowCount && snapshotRes.rows[0].questions) {
      let rawQuestions = snapshotRes.rows[0].questions;
      if (typeof rawQuestions === "string") {
        try { rawQuestions = JSON.parse(rawQuestions); } catch { rawQuestions = []; }
      }
      if (Array.isArray(rawQuestions) && rawQuestions.length > 0) {
        questions = rawQuestions.map((q: any, idx: number) => {
          let rawOptions = q.options_json || q.options;
          if (typeof rawOptions === "string") {
            try { rawOptions = JSON.parse(rawOptions); } catch { rawOptions = []; }
          }
          let normalizedOptions: string[] = [];
          if (Array.isArray(rawOptions)) {
            normalizedOptions = rawOptions.map((opt: any) => {
              if (typeof opt === "string") return opt;
              if (opt && typeof opt === "object") {
                if (opt.key && opt.text) return `${opt.key}. ${opt.text}`;
                if (opt.text) return opt.text;
                if (opt.label) return opt.label;
              }
              return String(opt);
            });
          }
          const qType = (q.question_type || q.type || "").toUpperCase();
          const isCoding = qType === "CODING";
          const isSubjective =
            qType === "SHORT_ANSWER" ||
            qType === "DESCRIPTIVE" ||
            qType === "ESSAY" ||
            qType === "SUBJECTIVE";

          return {
            id: q.id,
            questionText: q.question_text || q.prompt || "",
            prompt: q.question_text || q.prompt || "",
            questionType: q.question_type || qType,
            type: isCoding ? "coding" : (isSubjective ? "subjective" : "mcq"),
            options: normalizedOptions,
            marks: parseFloat(q.marks) || 2.0,
            suggestedMarks: parseFloat(q.marks) || 2.0,
            bloomLevel: q.bloom_level || q.bloomLevel,
            difficulty: q.difficulty,
            section: q.section,
            orderIndex: idx + 1,
            publicProblem: q.public_problem || null,
          };
        });
      }
    }

    if (questions.length === 0) {
      // Fallback to question_bank for legacy or unsnapshotted mock exams
      const targetOfferingId = activeSchedule.courseOfferingId;
      const qRes = await queryDb(`
        SELECT DISTINCT ON (qb.question_text)
          qb.id, qb.question_text, qb.question_type, qb.options_json, qb.marks, qb.bloom_level, qb.difficulty
        FROM question_bank qb
        WHERE qb.course_offering_id = $1 AND qb.tenant_id = $2
          AND qb.review_status = 'APPROVED_FOR_QUESTION_BANK'
        ORDER BY qb.question_text, qb.id ASC
        LIMIT 50
      `, [targetOfferingId, tenantId]);

      questions = qRes.rows.map((row: any, idx: number) => {
        let rawOptions = row.options_json;
        if (typeof rawOptions === "string") {
          try {
            rawOptions = JSON.parse(rawOptions);
          } catch {
            rawOptions = [];
          }
        }
        let normalizedOptions: string[] = [];
        if (Array.isArray(rawOptions)) {
          normalizedOptions = rawOptions.map((opt: any) => {
            if (typeof opt === "string") return opt;
            if (opt && typeof opt === "object") {
              if (opt.key && opt.text) return `${opt.key}. ${opt.text}`;
              if (opt.text) return opt.text;
              if (opt.label) return opt.label;
            }
            return String(opt);
          });
        }

        const qType = (row.question_type || "").toUpperCase();
        const isSubjective =
          qType === "SHORT_ANSWER" ||
          qType === "DESCRIPTIVE" ||
          qType === "ESSAY" ||
          qType === "SUBJECTIVE";

        return {
          id: row.id,
          questionText: row.question_text,
          prompt: row.question_text,
          questionType: row.question_type,
          type: isSubjective ? "subjective" : "mcq",
          options: normalizedOptions,
          marks: parseFloat(row.marks) || 2.0,
          suggestedMarks: parseFloat(row.marks) || 2.0,
          bloomLevel: row.bloom_level,
          difficulty: row.difficulty,
          orderIndex: idx + 1,
        };
      });
    }

    // 4. Restore previously saved responses from attempt_responses for exam resumption
    const activeAttemptId = paramAttemptId || latestAttempt?.id;
    const savedResponses: Record<string, string> = {};

    if (activeAttemptId) {
      const respRes = await queryDb(`
        SELECT question_id, answer_json
        FROM attempt_responses
        WHERE tenant_id = $1
          AND attempt_id = $2
      `, [tenantId, activeAttemptId]);

      for (const row of respRes.rows) {
        try {
          const parsed = typeof row.answer_json === "string" ? JSON.parse(row.answer_json) : row.answer_json;
          const ans = parsed?.selectedOption || parsed?.answer || (typeof parsed === "string" ? parsed : "");
          if (ans) {
            savedResponses[row.question_id] = ans;
          }
        } catch {
          if (typeof row.answer_json === "string") {
            savedResponses[row.question_id] = row.answer_json;
          }
        }
      }
    }

    // 5. Fetch proctoring configuration for this exam
    const proctorRes = await queryDb(`
      SELECT seb_required, camera_required, mic_required, fullscreen_required, consent_text, consent_version
      FROM exam_proctoring_configs
      WHERE tenant_id = $1 AND exam_schedule_id = $2
      LIMIT 1
    `, [tenantId, activeSchedule.scheduleId]);

    const proctorConfig = proctorRes.rows[0] || {
      seb_required: false,
      camera_required: true,
      mic_required: false,
      fullscreen_required: true,
      consent_text: "I hereby agree to adhere to the KLE Technological University Academic Honor Code. I consent to fullscreen and tab-switch monitoring during this examination session. I understand that all integrity events are recorded for human faculty review.",
      consent_version: "1.0.0",
    };

    return NextResponse.json({
      success: true,
      schedule: activeSchedule,
      proctorConfig: {
        sebRequired: proctorConfig.seb_required,
        cameraRequired: proctorConfig.camera_required,
        micRequired: proctorConfig.mic_required,
        fullscreenRequired: proctorConfig.fullscreen_required,
        consentText: proctorConfig.consent_text,
        consentVersion: proctorConfig.consent_version,
      },
      attempt: latestAttempt ? {
        id: latestAttempt.id,
        status: latestAttempt.status,
        serverStartTime: latestAttempt.server_start_time,
        serverDeadline: latestAttempt.server_deadline,
        submittedAt: latestAttempt.submitted_at,
        maxMarks: parseFloat(latestAttempt.max_marks),
      } : null,
      questions,
      savedResponses,
    });
  } catch (error: any) {
    logEvent("error", "Error fetching student attempt state", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "STUDENT") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { tenantId, userId: studentId } = authUser;

    const body = await req.json();
    const action = body.action || "START";
    if (body.studentId && body.studentId !== studentId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (body.attemptId) {
      const attempt = await queryDb(
        "SELECT id FROM exam_attempts WHERE id = $1 AND tenant_id = $2 AND student_id = $3",
        [body.attemptId, tenantId, studentId]
      );
      if (!attempt.rowCount) return NextResponse.json({ error: "Attempt unavailable" }, { status: 404 });
    }
    const schedule = await queryDb(
      `SELECT id, course_offering_id FROM exam_schedules
        WHERE tenant_id = $1 AND ($2::uuid IS NULL OR id = $2)
        ORDER BY created_at DESC LIMIT 1`,
      [tenantId, body.scheduleId || null]
    );
    if (!schedule.rowCount) return NextResponse.json({ error: "Schedule unavailable" }, { status: 404 });
    const { id: scheduleId, course_offering_id: courseOfferingId } = schedule.rows[0];

    const registration = await queryDb(
      `SELECT 1 FROM exam_registrations r JOIN aura_password_credentials c ON c.student_id=r.student_id
       WHERE r.tenant_id=$1 AND r.schedule_id=$2 AND c.membership_id=$3`,
      [tenantId,scheduleId,authUser.membershipId]
    );
    if (!registration.rowCount) return NextResponse.json({error:"Registration required"},{status:403});
    // 1. ACTION: START ATTEMPT
    if (action === "START") {
      // Find or create attempt
      // Find active in-progress attempt that hasn't expired
      const existing = await queryDb(`
        SELECT id, status, server_start_time, server_deadline
        FROM exam_attempts
        WHERE tenant_id = $1
          AND student_id = $2
          AND exam_schedule_id = $3
          AND status = 'IN_PROGRESS'
          AND server_deadline > clock_timestamp()
        ORDER BY created_at DESC
        LIMIT 1
      `, [tenantId, studentId, scheduleId]);

      if (existing.rows.length > 0) {
        return NextResponse.json({
          success: true,
          attemptId: existing.rows[0].id,
          status: "IN_PROGRESS",
          serverDeadline: existing.rows[0].server_deadline,
        });
      }

      // Calculate next attempt number
      const maxAttRes = await queryDb(`
        SELECT COALESCE(MAX(attempt_number), 0) + 1 as next_attempt
        FROM exam_attempts
        WHERE tenant_id = $1 AND exam_schedule_id = $2 AND student_id = $3
      `, [tenantId, scheduleId, studentId]);
      const nextAttempt = parseInt(maxAttRes.rows[0]?.next_attempt, 10) || 1;

      const attemptId = crypto.randomUUID();
      const insertRes = await queryDb(`
        INSERT INTO exam_attempts (
          id, tenant_id, exam_schedule_id, course_offering_id, student_id,
          attempt_number, status, server_start_time, server_deadline, max_marks, created_at, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'IN_PROGRESS',
          NOW(), NOW() + INTERVAL '60 minutes', 50.0, NOW(), NOW()
        )
        RETURNING id, server_deadline
      `, [attemptId, tenantId, scheduleId, courseOfferingId, studentId, nextAttempt]);

      const actualAttemptId = insertRes.rows[0]?.id || attemptId;
      const actualDeadline = insertRes.rows[0]?.server_deadline || new Date(Date.now() + 3600000).toISOString();

      logEvent("info", "Student exam attempt started", { attemptId: actualAttemptId, studentId });

      return NextResponse.json({
        success: true,
        attemptId: actualAttemptId,
        status: "IN_PROGRESS",
        serverDeadline: actualDeadline,
      });
    }

    // 1B. ACTION: PREFLIGHT & CONSENT RECORDING (PROCTORING)
    if (action === "PREFLIGHT_CONSENT") {
      const { attemptId, consentVersion, preflightSummary, requestUrl } = body;

      // Ensure attempt exists in database to satisfy foreign key
      let targetAttemptId = attemptId;
      if (!targetAttemptId) {
        const existing = await queryDb(`
          SELECT id FROM exam_attempts
          WHERE tenant_id = $1 AND student_id = $2 AND exam_schedule_id = $3
          LIMIT 1
        `, [tenantId, studentId, scheduleId]);

        if (existing.rows.length > 0) {
          targetAttemptId = existing.rows[0].id;
        } else {
          targetAttemptId = crypto.randomUUID();
          await queryDb(`
            INSERT INTO exam_attempts (
              id, tenant_id, exam_schedule_id, course_offering_id, student_id,
              attempt_number, status, server_start_time, server_deadline, max_marks, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, 1, 'IN_PROGRESS',
              NOW(), NOW() + INTERVAL '60 minutes', 50.0, NOW(), NOW()
            )
            ON CONFLICT (tenant_id, exam_schedule_id, student_id, attempt_number)
            DO UPDATE SET status = 'IN_PROGRESS', updated_at = NOW()
          `, [targetAttemptId, tenantId, scheduleId, courseOfferingId, studentId]);
        }
      }

      // Check if SEB is required
      const proctorRes = await queryDb(`
        SELECT seb_required, seb_config_key_hash, seb_browser_exam_key_hash
        FROM exam_proctoring_configs
        WHERE tenant_id = $1 AND exam_schedule_id = $2
        LIMIT 1
      `, [tenantId, scheduleId]);

      let sebVerified = false;
      const proctorConf = proctorRes.rows[0];

      if (proctorConf && proctorConf.seb_required) {
        // Enforce authentic Safe Exam Browser cryptographic verification
        const { verifySebRequest } = await import("@exam-system/api");
        const headersRecord: Record<string, string> = {};
        req.headers.forEach((v, k) => {
          headersRecord[k] = v;
        });

        const expectedKey = proctorConf.seb_config_key_hash || "default-institutional-seb-key";
        const verification = verifySebRequest(
          headersRecord,
          requestUrl || req.url,
          expectedKey,
          "CONFIG_KEY"
        );

        if (!verification.verified) {
          logEvent("warn", "SEB verification failed during preflight", {
            studentId,
            reason: verification.reason,
          });
          return NextResponse.json(
            { error: `SEB_VERIFICATION_FAILED: ${verification.reason}` },
            { status: 403 }
          );
        }
        sebVerified = true;
      }

      // Persist consent and preflight audit record
      await queryDb(`
        INSERT INTO attempt_proctor_consents (
          id, tenant_id, attempt_id, student_id, consent_version,
          preflight_summary, seb_verified, ip_address, user_agent, consented_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW()
        )
        ON CONFLICT (attempt_id)
        DO UPDATE SET
          consent_version = EXCLUDED.consent_version,
          preflight_summary = EXCLUDED.preflight_summary,
          seb_verified = EXCLUDED.seb_verified,
          consented_at = NOW()
      `, [
        crypto.randomUUID(),
        tenantId,
        targetAttemptId,
        studentId,
        consentVersion || "1.0.0",
        JSON.stringify(preflightSummary || {}),
        sebVerified,
        req.headers.get("x-forwarded-for") || "127.0.0.1",
        req.headers.get("user-agent") || "Browser Client",
      ]);

      // Record preflight integrity signal
      await queryDb(`
        INSERT INTO attempt_integrity_signals (
          id, tenant_id, attempt_id, signal_type, metadata, logged_at, review_status
        ) VALUES (
          $1, $2, $3, 'PREFLIGHT_CONSENT_ACCEPTED', $4, NOW(), 'PENDING_REVIEW'
        )
      `, [
        crypto.randomUUID(),
        tenantId,
        targetAttemptId,
        JSON.stringify({ consentVersion, sebVerified, preflightSummary }),
      ]);

      logEvent("info", "Candidate consent & preflight recorded", {
        studentId,
        attemptId: targetAttemptId,
        sebVerified,
      });

      return NextResponse.json({
        success: true,
        attemptId: targetAttemptId,
        consented: true,
        sebVerified,
        message: "Candidate consent and preflight checks recorded successfully.",
      });
    }

    // 1C. ACTION: RECORD PROCTORING SIGNAL / INTEGRITY EVENT
    if (action === "PROCTOR_EVENT") {
      const { attemptId, signalType, metadata } = body;
      let targetAttemptId = attemptId;
      if (!targetAttemptId) {
        const existing = await queryDb(`
          SELECT id FROM exam_attempts
          WHERE tenant_id = $1 AND student_id = $2 AND exam_schedule_id = $3
          LIMIT 1
        `, [tenantId, studentId, scheduleId]);
        if (existing.rows.length > 0) {
          targetAttemptId = existing.rows[0].id;
        } else {
          return NextResponse.json(
            { error: "No active attempt found for student" },
            { status: 400 }
          );
        }
      }
      if (!signalType) {
        return NextResponse.json(
          { error: "signalType is required" },
          { status: 400 }
        );
      }

      const eventId = crypto.randomUUID();
      await queryDb(`
        INSERT INTO attempt_integrity_signals (
          id, tenant_id, attempt_id, signal_type, metadata, logged_at, review_status
        ) VALUES (
          $1, $2, $3, $4, $5, NOW(), 'PENDING_REVIEW'
        )
      `, [
        eventId,
        tenantId,
        targetAttemptId,
        signalType,
        JSON.stringify(metadata || {}),
      ]);

      logEvent("info", "Proctoring integrity signal logged", {
        attemptId: targetAttemptId,
        studentId,
        signalType,
      });

      return NextResponse.json({
        success: true,
        eventId,
        signalType,
        loggedAt: new Date().toISOString(),
      });
    }

    // 2. ACTION: AUTOSAVE RESPONSE (Single or Batch)
    if (action === "AUTOSAVE") {
      const { attemptId, questionId, answer, sequenceNumber, responses } = body;
      const seq = sequenceNumber || 1;
      let savedCount = 0;

      if (!attemptId) {
        return NextResponse.json({ error: "attemptId is required for AUTOSAVE" }, { status: 400 });
      }

      // Authoritative proctor verification gate for autosave
      try {
        await assertProctoredAttemptActive(authUser, attemptId, "AUTOSAVE");
      } catch (authErr: any) {
        if (authErr instanceof AuraProctorAuthorizationError) {
          return NextResponse.json({
            error: authErr.code,
            message: authErr.reason,
            attemptId: authErr.attemptId,
            disqualified: true,
          }, { status: authErr.statusCode });
        }
        throw authErr;
      }

      // Batch responses autosave (Record<string, string>)
      if (attemptId && responses && typeof responses === "object" && !Array.isArray(responses)) {
        for (const [qId, ans] of Object.entries(responses)) {
          if (!qId) continue;
          await queryDb(`
            INSERT INTO attempt_responses (
              id, tenant_id, attempt_id, question_id, answer_json, sequence_number, saved_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, NOW()
            )
            ON CONFLICT (attempt_id, question_id)
            DO UPDATE SET answer_json = EXCLUDED.answer_json,
                          sequence_number = EXCLUDED.sequence_number,
                          saved_at = NOW()
          `, [
            crypto.randomUUID(),
            tenantId,
            attemptId,
            qId,
            JSON.stringify({ answer: ans, selectedOption: ans }),
            seq,
          ]);
          savedCount++;
        }

        return NextResponse.json({
          success: true,
          savedAt: new Date().toISOString(),
          sequenceNumber: seq,
          responsesSaved: savedCount,
        });
      }

      // Single question autosave
      if (attemptId && questionId) {
        await queryDb(`
          INSERT INTO attempt_responses (
            id, tenant_id, attempt_id, question_id, answer_json, sequence_number, saved_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NOW()
          )
          ON CONFLICT (attempt_id, question_id)
          DO UPDATE SET answer_json = EXCLUDED.answer_json,
                        sequence_number = EXCLUDED.sequence_number,
                        saved_at = NOW()
        `, [
          crypto.randomUUID(),
          tenantId,
          attemptId,
          questionId,
          JSON.stringify({ answer, selectedOption: answer }),
          seq,
        ]);
        savedCount = 1;
      }

      return NextResponse.json({
        success: true,
        savedAt: new Date().toISOString(),
        sequenceNumber: seq,
        responsesSaved: savedCount,
      });
    }

    // 3. ACTION: SUBMIT ATTEMPT & DETERMINISTIC OBJECTIVE SCORING
    if (action === "SUBMIT") {
      const { attemptId, answers, responses } = body;
      const responseMap: Record<string, string> = {};

      if (answers && typeof answers === "object" && !Array.isArray(answers)) {
        Object.assign(responseMap, answers);
      }
      if (responses && typeof responses === "object" && !Array.isArray(responses)) {
        Object.assign(responseMap, responses);
      } else if (Array.isArray(responses)) {
        for (const item of responses) {
          if (item?.questionId) {
            responseMap[item.questionId] = item.selectedOption || item.answer || "";
          }
        }
      }

      const targetAttemptId = attemptId || crypto.randomUUID();

      // Authoritative proctor verification gate for submission
      try {
        await assertProctoredAttemptActive(authUser, targetAttemptId, "SUBMIT");
      } catch (authErr: any) {
        if (authErr instanceof AuraProctorAuthorizationError) {
          return NextResponse.json({
            error: authErr.code,
            message: authErr.reason,
            attemptId: authErr.attemptId,
            disqualified: true,
          }, { status: authErr.statusCode });
        }
        throw authErr;
      }

      // Persist all answers into attempt_responses
      for (const [qId, ans] of Object.entries(responseMap)) {
        if (!qId) continue;
        await queryDb(`
          INSERT INTO attempt_responses (
            id, tenant_id, attempt_id, question_id, answer_json, sequence_number, saved_at
          ) VALUES (
            $1, $2, $3, $4, $5, 1, NOW()
          )
          ON CONFLICT (attempt_id, question_id)
          DO UPDATE SET answer_json = EXCLUDED.answer_json,
                        saved_at = NOW()
        `, [
          crypto.randomUUID(),
          tenantId,
          targetAttemptId,
          qId,
          JSON.stringify({ answer: ans, selectedOption: ans }),
        ]);
      }

      // Authoritative objective grading against decoupled question_answer_keys
      let objectiveScore = 0;
      for (const [qId, ans] of Object.entries(responseMap)) {
        const keyRes = await queryDb(`
          SELECT correct_answer FROM question_answer_keys WHERE question_id = $1 LIMIT 1
        `, [qId]);

        if (keyRes.rows.length > 0) {
          const correct = String(keyRes.rows[0].correct_answer).trim().toUpperCase();
          const studentChoice = String(ans).trim().toUpperCase();
          const studentKey = studentChoice.match(/^([A-Z])[\.\:\s]/)?.[1] || studentChoice;

          if (studentChoice === correct || studentKey === correct) {
            objectiveScore += 2.0; // 2 marks per MCQ item
          }
        }
      }

      // Add evaluated marks for coding questions from attempt_responses
      const codingRespRes = await queryDb(`
        SELECT answer_json
        FROM attempt_responses
        WHERE attempt_id = $1 AND tenant_id = $2
      `, [targetAttemptId, tenantId]);

      for (const row of codingRespRes.rows) {
        const data = row.answer_json;
        if (data && data.isEvaluated && typeof data.marksAwarded === "number") {
          objectiveScore += data.marksAwarded;
        }
      }

      // Generate non-repudiation cryptographic receipt hash
      const submittedTimestamp = new Date().toISOString();
      const receiptPayload = `${tenantId}:${targetAttemptId}:${studentId}:${submittedTimestamp}:${objectiveScore}`;
      const submissionReceiptHash = crypto.createHash("sha256").update(receiptPayload).digest("hex");

      // Update exam_attempts
      await queryDb(`
        UPDATE exam_attempts
        SET status = 'SUBMITTED',
            submitted_at = NOW(),
            objective_score = $1,
            total_score = $1,
            updated_at = NOW()
        WHERE id = $2 AND tenant_id = $3 AND student_id = $4 AND status = 'IN_PROGRESS'
      `, [objectiveScore, targetAttemptId, tenantId, studentId]);

      // Audit submission
      await queryDb(`
        INSERT INTO audit_events (
          id, tenant_id, user_id, action, resource_type, resource_id, metadata_json, created_at
        ) VALUES (
          $1, $2, $3, 'EXAM_SUBMISSION_FINALIZED', 'EXAM_ATTEMPT', $4, $5, NOW()
        )
      `, [
        crypto.randomUUID(),
        tenantId,
        studentId,
        targetAttemptId,
        JSON.stringify({
          studentId,
          attemptId: targetAttemptId,
          receiptHash: submissionReceiptHash,
          submittedAt: submittedTimestamp,
          objectiveScoreScored: true,
        }),
      ]);

      logEvent("info", "Student exam attempt submitted, sealed and objectively scored", {
        studentId,
        attemptId: targetAttemptId,
        objectiveScore,
        receiptHash: submissionReceiptHash,
      });

      return NextResponse.json({
        success: true,
        status: "SUBMITTED",
        canonicalState: "SUBMITTED",
        submissionReceiptHash,
        receiptHash: submissionReceiptHash,
        submittedAt: submittedTimestamp,
        message: "SUBMITTED — AWAITING EVALUATION",
      });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error: any) {
    logEvent("error", "Error processing student attempt action", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
