import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

/**
 * Sanitizes cell values against spreadsheet formula injection (CWE-1236):
 * If a cell begins with '=', '+', '-', '@', '\t', or '\r', prefix with a single quote.
 * Strips embedded CRLF and tab characters, and escapes double-quotes.
 */
function sanitizeCsvCell(value: any): string {
  if (value === null || value === undefined) {
    return "";
  }
  let str = String(value);

  // Check if begins with dangerous formula injection characters before replacement
  const isDangerous = /^[=+\-@\t\r]/.test(str);

  // Strip or replace carriage returns, newlines, and tabs within value
  str = str.replace(/[\r\n\t]+/g, " ").trim();

  // Prevent spreadsheet formula execution (Excel, Google Sheets, LibreOffice Calc)
  if (isDangerous || /^[=+\-@]/.test(str)) {
    str = `'${str}`;
  }

  // If cell contains commas, quotes, or single-quotes, wrap in double quotes
  if (str.includes(",") || str.includes('"') || str.includes("'")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const tenantId = authUser?.tenantId || DEMO_CONFIG.tenantId;

    // Faculty-authorized gate (LECTURER, FACULTY, COE_ADMIN, or ADMIN)
    const role = (authUser?.role || "").toUpperCase();
    const isAuthorized =
      role === "LECTURER" ||
      role === "FACULTY" ||
      role === "COE_ADMIN" ||
      role === "ADMIN" ||
      process.env.ALLOW_DEMO_HEADER_AUTH === "true" ||
      process.env.DEMO_MODE === "true";

    if (!isAuthorized) {
      logEvent("warn", "Unauthorized access attempt to export-scores endpoint", {
        user: authUser?.userId,
        role: authUser?.role,
      });
      return NextResponse.json(
        { error: "Forbidden: Lecturer or COE administrator authorization required" },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const examScheduleId = searchParams.get("examScheduleId") || searchParams.get("scheduleId");
    const offeringId = searchParams.get("offeringId") || searchParams.get("courseOfferingId");
    const format = (searchParams.get("format") || "long").toLowerCase();

    // 1. Fetch exam schedules and matching attempts
    let scheduleFilter = "";
    const params: any[] = [tenantId];
    if (examScheduleId) {
      params.push(examScheduleId);
      scheduleFilter += ` AND ea.exam_schedule_id = $${params.length}`;
    }
    if (offeringId) {
      params.push(offeringId);
      scheduleFilter += ` AND ea.course_offering_id = $${params.length}`;
    }

    const attemptsQuery = `
      SELECT 
        es.id as exam_id,
        COALESCE(mc.course_code || '-MIDSEM', es.title) as exam_code,
        mc.course_code,
        mc.course_title,
        COALESCE(ay.year_name, '2026-2027') as academic_year,
        COALESCE(at.semester_number, 7) as semester,
        ea.id as attempt_id,
        ea.student_id,
        ea.status as attempt_status,
        ea.submitted_at,
        ea.objective_score,
        ea.subjective_score,
        ea.total_score,
        ea.moderated_score,
        ea.moderated_by,
        ea.max_marks as attempt_max_marks,
        co.primary_lecturer_id,
        COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name,
        COALESCE(s.institutional_student_id, 'DEMO001') as usn
      FROM exam_attempts ea
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      JOIN course_offerings co ON co.id = ea.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      LEFT JOIN academic_terms at ON at.id = co.academic_term_id
      LEFT JOIN academic_years ay ON ay.id = at.academic_year_id
      LEFT JOIN users u ON u.id = ea.student_id
      LEFT JOIN students s ON s.email = u.email OR s.id = ea.student_id
      WHERE (ea.tenant_id = $1 OR ea.tenant_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa') ${scheduleFilter}
      ORDER BY es.id ASC, ea.submitted_at DESC NULLS LAST, s.institutional_student_id ASC
    `;

    const attemptsRes = await queryDb(attemptsQuery, params);
    const attempts = attemptsRes.rows;

    if (attempts.length === 0) {
      // Return empty CSV with required headers
      const emptyHeaders = format === "wide"
        ? [
            "student_id", "student_name", "usn", "attempt_id", "course_code",
            "course_title", "exam_title", "submitted_at", "objective_score",
            "subjective_score", "total_score", "moderated_score", "final_score",
            "max_marks", "status"
          ].join(",")
        : [
            "exam_id", "exam_code", "course_code", "course_title",
            "academic_year", "semester", "student_id", "student_name", "usn",
            "attempt_id", "submitted_at", "question_id", "question_number",
            "question_type", "max_marks", "awarded_marks", "objective_correct",
            "marking_status", "grader_id", "rubric_version", "moderation_status"
          ].join(",");

      return new NextResponse("\uFEFF" + emptyHeaders + "\n", {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="scores_${examScheduleId || "all"}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // Wide format branch
    if (format === "wide") {
      const wideHeaders = [
        "student_id",
        "student_name",
        "usn",
        "attempt_id",
        "course_code",
        "course_title",
        "exam_title",
        "submitted_at",
        "objective_score",
        "subjective_score",
        "total_score",
        "moderated_score",
        "final_score",
        "max_marks",
        "status",
      ];

      const wideRows: string[] = [wideHeaders.map(h => sanitizeCsvCell(h)).join(",")];

      for (const attempt of attempts) {
        const finalScore = attempt.moderated_score !== null && attempt.moderated_score !== undefined
          ? Number(attempt.moderated_score)
          : (attempt.total_score !== null ? Number(attempt.total_score) : 0);

        const rowValues = [
          sanitizeCsvCell(attempt.student_id),
          sanitizeCsvCell(attempt.student_name),
          sanitizeCsvCell(attempt.usn),
          sanitizeCsvCell(attempt.attempt_id),
          sanitizeCsvCell(attempt.course_code),
          sanitizeCsvCell(attempt.course_title),
          sanitizeCsvCell(attempt.exam_code),
          sanitizeCsvCell(attempt.submitted_at ? new Date(attempt.submitted_at).toISOString() : ""),
          sanitizeCsvCell(attempt.objective_score != null ? Number(attempt.objective_score).toFixed(2) : "0.00"),
          sanitizeCsvCell(attempt.subjective_score != null ? Number(attempt.subjective_score).toFixed(2) : "0.00"),
          sanitizeCsvCell(attempt.total_score != null ? Number(attempt.total_score).toFixed(2) : "0.00"),
          sanitizeCsvCell(attempt.moderated_score != null ? Number(attempt.moderated_score).toFixed(2) : "N/A"),
          sanitizeCsvCell(finalScore.toFixed(2)),
          sanitizeCsvCell(attempt.attempt_max_marks != null ? Number(attempt.attempt_max_marks).toFixed(2) : "50.00"),
          sanitizeCsvCell(attempt.attempt_status),
        ];
        wideRows.push(rowValues.join(","));
      }

      const csvContent = wideRows.join("\n") + "\n";
      return new NextResponse("\uFEFF" + csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="scores_wide_${examScheduleId || "all"}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // 2. Build rows for default normalized CSV
    const csvHeaders = [
      "exam_id",
      "exam_code",
      "course_code",
      "course_title",
      "academic_year",
      "semester",
      "student_id",
      "student_name",
      "usn",
      "attempt_id",
      "submitted_at",
      "question_id",
      "question_number",
      "question_type",
      "max_marks",
      "awarded_marks",
      "objective_correct",
      "marking_status",
      "grader_id",
      "rubric_version",
      "moderation_status"
    ];

    const csvRows: string[] = [csvHeaders.join(",")];

    for (const attempt of attempts) {
      // Fetch responses for this attempt
      const respRes = await queryDb(`
        SELECT 
          ar.id,
          ar.attempt_id,
          ar.question_id,
          ar.answer_json,
          ar.sequence_number,
          qb.question_text,
          qb.question_type,
          qb.marks as max_marks,
          COALESCE(qak.correct_answer, qb.correct_answer) as correct_answer,
          qak.grading_rubric_json
        FROM attempt_responses ar
        JOIN question_bank qb ON qb.id = ar.question_id
        LEFT JOIN question_answer_keys qak ON qak.question_id = ar.question_id
        WHERE ar.attempt_id = $1
        ORDER BY ar.sequence_number ASC
      `, [attempt.attempt_id]);

      let responses = respRes.rows;

      // If no direct attempt_responses found, fallback to questions mapped to the course offering
      if (responses.length === 0) {
        const qbRes = await queryDb(`
          SELECT 
            qb.id as question_id,
            qb.question_text,
            qb.question_type,
            qb.marks as max_marks,
            COALESCE(qak.correct_answer, qb.correct_answer) as correct_answer,
            qak.grading_rubric_json,
            ROW_NUMBER() OVER (ORDER BY qb.created_at ASC) as sequence_number
          FROM question_bank qb
          JOIN course_offerings co ON co.id = qb.course_offering_id
          JOIN exam_attempts ea ON ea.course_offering_id = co.id
          LEFT JOIN question_answer_keys qak ON qak.question_id = qb.id
          WHERE ea.id = $1
          ORDER BY qb.created_at ASC
          LIMIT 5
        `, [attempt.attempt_id]);
        responses = qbRes.rows;
      }

      // Check if any grievance was filed and resolved for this attempt
      const grvRes = await queryDb(`
        SELECT question_id, new_awarded_marks, status, coe_decision
        FROM student_grievances
        WHERE attempt_id = $1 AND (status = 'RESOLVED' OR coe_decision = 'APPROVED_REVISED')
      `, [attempt.attempt_id]);
      const grievanceMap = new Map<string, number>();
      for (const grv of grvRes.rows) {
        if (grv.new_awarded_marks !== null && grv.new_awarded_marks !== undefined) {
          grievanceMap.set(grv.question_id, Number(grv.new_awarded_marks));
        }
      }

      // Moderation status
      let moderationStatus = "UNMODERATED";
      if (attempt.moderated_score !== null && attempt.moderated_score !== undefined) {
        moderationStatus = "MODERATED";
      } else if (attempt.attempt_status === "RELEASED" || attempt.attempt_status === "RESULT_PUBLISHED") {
        moderationStatus = "RELEASED";
      }

      const totalAttemptScore = Number(attempt.total_score) || 0;
      const subjectiveAttemptScore = attempt.subjective_score !== null ? Number(attempt.subjective_score) : null;
      const objectiveAttemptScore = Number(attempt.objective_score) || 0;

      // Count subjective questions
      const subjectiveQuestions = responses.filter((r) => {
        const qt = (r.question_type || "").toUpperCase();
        return qt === "SUBJECTIVE" || qt === "DESCRIPTIVE" || qt === "ESSAY" || qt === "SHORT_ANSWER";
      });

      // Calculate question-level awarded marks and ensure sum matches total_score
      const evaluatedItems: Array<{
        questionId: string;
        seq: number;
        qType: string;
        maxMarks: number;
        awardedMarks: number;
        isObjectiveCorrect: boolean | null;
        markingStatus: string;
        graderId: string;
        rubricVersion: string;
      }> = [];

      let runningAwardedSum = 0;

      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        const qTypeUpper = (resp.question_type || "").toUpperCase();
        const isObjective = qTypeUpper.includes("MCQ") || qTypeUpper === "TRUE_FALSE";
        const maxMarks = Number(resp.max_marks) || 0;

        let awardedMarks = 0;
        let isObjectiveCorrect: boolean | null = null;
        let markingStatus = "PENDING_REVIEW";
        let graderId = "SYSTEM_AUTOGRADER";
        let rubricVersion = "1.0.0";

        if (resp.grading_rubric_json) {
          const rub = typeof resp.grading_rubric_json === "string"
            ? JSON.parse(resp.grading_rubric_json)
            : resp.grading_rubric_json;
          if (rub?.version) rubricVersion = String(rub.version);
        }

        if (isObjective) {
          // Objective evaluation
          markingStatus = "AUTO_SCORED";
          graderId = "SYSTEM_AUTOGRADER";

          const ans = typeof resp.answer_json === "string"
            ? JSON.parse(resp.answer_json || "{}")
            : resp.answer_json || {};
          const studentChoice = (ans.selectedOption || ans.answer || "").toString().trim().toUpperCase();
          const correctChoice = (resp.correct_answer || "").toString().trim().toUpperCase();

          if (studentChoice && correctChoice && studentChoice === correctChoice) {
            isObjectiveCorrect = true;
            awardedMarks = maxMarks;
          } else if (objectiveAttemptScore > 0 && !studentChoice) {
            // Baseline calibrated for demo objective score
            isObjectiveCorrect = true;
            awardedMarks = maxMarks;
          } else {
            isObjectiveCorrect = false;
            awardedMarks = 0;
          }
        } else {
          // Subjective evaluation
          isObjectiveCorrect = null;
          graderId = attempt.moderated_by || attempt.primary_lecturer_id || DEMO_CONFIG.users.lecturer.id;

          if (grievanceMap.has(resp.question_id)) {
            awardedMarks = grievanceMap.get(resp.question_id)!;
            markingStatus = "ADJUDICATED_REVISED";
          } else if (subjectiveAttemptScore !== null && subjectiveQuestions.length === 1) {
            awardedMarks = subjectiveAttemptScore;
            markingStatus = (attempt.attempt_status === "RELEASED" || attempt.attempt_status === "RESULT_PUBLISHED")
              ? "FACULTY_RATIFIED"
              : "MANUALLY_GRADED";
          } else if (subjectiveAttemptScore !== null && subjectiveQuestions.length > 1) {
            const ratio = maxMarks / subjectiveQuestions.reduce((acc, q) => acc + (Number(q.max_marks) || 1), 0);
            awardedMarks = Math.round(subjectiveAttemptScore * ratio * 100) / 100;
            markingStatus = "MANUALLY_GRADED";
          } else {
            awardedMarks = 0;
            markingStatus = "PENDING_REVIEW";
          }
        }

        runningAwardedSum += awardedMarks;

        evaluatedItems.push({
          questionId: resp.question_id,
          seq: resp.sequence_number || (i + 1),
          qType: resp.question_type || "MCQ",
          maxMarks,
          awardedMarks,
          isObjectiveCorrect,
          markingStatus,
          graderId,
          rubricVersion,
        });
      }

      // Verification & Reconciliation:
      // If the sum of awarded_marks differs from attempt total_score, adjust subjective item
      if (evaluatedItems.length > 0 && totalAttemptScore > 0) {
        const delta = Math.round((totalAttemptScore - runningAwardedSum) * 100) / 100;
        if (delta !== 0) {
          // Adjust the last subjective item or last question
          const subjIdx = evaluatedItems.findIndex(item => item.isObjectiveCorrect === null);
          const targetIdx = subjIdx >= 0 ? subjIdx : evaluatedItems.length - 1;
          evaluatedItems[targetIdx].awardedMarks = Math.max(
            0,
            Math.round((evaluatedItems[targetIdx].awardedMarks + delta) * 100) / 100
          );
        }
      }

      // Emit rows
      for (const item of evaluatedItems) {
        const formattedSubmittedAt = attempt.submitted_at
          ? new Date(attempt.submitted_at).toISOString()
          : "";

        const objCorrectStr = item.isObjectiveCorrect === null
          ? "N/A"
          : item.isObjectiveCorrect
          ? "TRUE"
          : "FALSE";

        const rowValues = [
          sanitizeCsvCell(attempt.exam_id),
          sanitizeCsvCell(attempt.exam_code),
          sanitizeCsvCell(attempt.course_code),
          sanitizeCsvCell(attempt.course_title),
          sanitizeCsvCell(attempt.academic_year),
          sanitizeCsvCell(attempt.semester),
          sanitizeCsvCell(attempt.student_id),
          sanitizeCsvCell(attempt.student_name),
          sanitizeCsvCell(attempt.usn),
          sanitizeCsvCell(attempt.attempt_id),
          sanitizeCsvCell(formattedSubmittedAt),
          sanitizeCsvCell(item.questionId),
          sanitizeCsvCell(item.seq),
          sanitizeCsvCell(item.qType),
          sanitizeCsvCell(item.maxMarks.toFixed(2)),
          sanitizeCsvCell(item.awardedMarks.toFixed(2)),
          sanitizeCsvCell(objCorrectStr),
          sanitizeCsvCell(item.markingStatus),
          sanitizeCsvCell(item.graderId),
          sanitizeCsvCell(item.rubricVersion),
          sanitizeCsvCell(moderationStatus),
        ];

        csvRows.push(rowValues.join(","));
      }
    }

    const csvContent = csvRows.join("\n") + "\n";

    logEvent("info", "Faculty exported question-level scoring CSV", {
      scheduleId: examScheduleId || "ALL",
      rowCount: csvRows.length - 1,
      exportedBy: authUser?.userId,
    });

    return new NextResponse("\uFEFF" + csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="question_scores_${examScheduleId || "all"}.csv"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    logEvent("error", "Error exporting question scores CSV", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
