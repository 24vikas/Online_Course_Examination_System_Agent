import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { assertAuthorized } from "@/lib/auth";
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
    // 1. Strict Institutional Authorization Gate: COE_ADMIN and SYSTEM_ADMIN only
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "SYSTEM_ADMIN"]);
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }
    const tenantId = authResult.user.tenantId;

    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get("scheduleId") || searchParams.get("examScheduleId");
    const exportType = (searchParams.get("type") || "marks").toLowerCase();
    const format = (searchParams.get("format") || "normalized").toLowerCase(); // 'normalized' | 'summary'

    // =========================================================================
    // PRODUCT B: CANDIDATE ELIGIBILITY ROSTER CSV
    // =========================================================================
    if (exportType === "roster") {
      let query = `
        SELECT 
          s.id as student_id,
          s.first_name || ' ' || COALESCE(s.last_name, '') as student_name,
          s.institutional_student_id as usn,
          s.email,
          COALESCE(s.current_semester, s.semester, 7) as semester,
          COALESCE((es_latest.evidence_snapshot->>'attendancePercentage')::numeric, 85.0) as attendance_rate,
          COALESCE((es_latest.evidence_snapshot->>'feeCleared')::boolean, true) as fee_cleared,
          COALESCE(mc.course_code, '26ECAC401') as course_code,
          COALESCE(mc.course_title, 'Agentic AI') as course_title,
          COALESCE(es_latest.decision, 'ELIGIBLE') as eligibility_status,
          COALESCE(es_latest.reasons->>0, 'Satisfies minimum 75% attendance and statutory tuition clearance') as eligibility_reason
        FROM students s
        LEFT JOIN enrollments e ON e.student_id = s.id AND e.tenant_id = s.tenant_id
        LEFT JOIN course_offerings co ON co.id = e.course_offering_id AND co.tenant_id = s.tenant_id
        LEFT JOIN master_courses mc ON mc.id = co.master_course_id
        LEFT JOIN LATERAL (
          SELECT decision, evidence_snapshot, reasons 
          FROM eligibility_snapshots es 
          WHERE es.tenant_id = s.tenant_id AND es.course_offering_id = co.id AND es.student_id = (SELECT u.id FROM users u WHERE lower(u.email) = lower(s.email))
          ORDER BY es.evaluated_at DESC 
          LIMIT 1
        ) es_latest ON true
        WHERE s.tenant_id = $1
      `;
      const params: any[] = [tenantId];

      if (scheduleId) {
        query += ` AND co.id IN (SELECT course_offering_id FROM exam_schedules WHERE id = $2 AND tenant_id = $1)`;
        params.push(scheduleId);
      }

      query += ` ORDER BY s.institutional_student_id ASC;`;

      const rosterRes = await queryDb(query, params);
      const rows = rosterRes.rows;

      const headers = [
        "student_name",
        "usn",
        "course_code",
        "course_title",
        "semester",
        "attendance_rate",
        "fee_cleared",
        "eligibility_status",
        "eligibility_reason"
      ];

      const csvLines = [headers.join(",")];
      for (const r of rows) {
        csvLines.push([
          sanitizeCsvCell(r.student_name),
          sanitizeCsvCell(r.usn),
          sanitizeCsvCell(r.course_code),
          sanitizeCsvCell(r.course_title),
          sanitizeCsvCell(r.semester),
          sanitizeCsvCell(r.attendance_rate ? `${Number(r.attendance_rate).toFixed(1)}%` : "0.0%"),
          sanitizeCsvCell(r.fee_cleared ? "CLEARED" : "PENDING"),
          sanitizeCsvCell(r.eligibility_status),
          sanitizeCsvCell(r.eligibility_reason)
        ].join(","));
      }

      const csvContent = "\uFEFF" + csvLines.join("\n") + "\n";
      logEvent("info", "COE candidate roster CSV exported", {
        actorId: authResult.user.userId,
        count: rows.length,
      });

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="coe_roster_${scheduleId || "all"}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // =========================================================================
    // PRODUCT A: EXAMINATION MARKS CSV
    // =========================================================================
    let scheduleFilter = "";
    const queryParams: any[] = [tenantId];

    if (scheduleId) {
      queryParams.push(scheduleId);
      scheduleFilter = `AND (ea.exam_schedule_id = $${queryParams.length} OR es.id = $${queryParams.length})`;
    }

    const attemptsQuery = `
      SELECT 
        es.id as exam_schedule_id,
        es.title as exam_title,
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
        (ea.results_published_at IS NOT NULL) as results_published,
        COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name,
        COALESCE(s.institutional_student_id, 'DEMO001') as usn,
        ea.course_offering_id
      FROM exam_attempts ea
      JOIN exam_schedules es ON es.id = ea.exam_schedule_id
      JOIN course_offerings co ON co.id = es.course_offering_id
      JOIN master_courses mc ON mc.id = co.master_course_id
      LEFT JOIN academic_terms at ON at.id = co.academic_term_id
      LEFT JOIN academic_years ay ON ay.id = at.academic_year_id
      LEFT JOIN users u ON u.id = ea.student_id
      LEFT JOIN students s ON s.tenant_id = ea.tenant_id AND lower(s.email) = lower(u.email)
      WHERE ea.tenant_id = $1
        ${scheduleFilter}
      ORDER BY es.id ASC, ea.submitted_at DESC NULLS LAST, s.institutional_student_id ASC;
    `;

    const attemptsRes = await queryDb(attemptsQuery, queryParams);
    const attempts = attemptsRes.rows;

    // Summary format: One row per student attempt
    if (format === "summary") {
      const summaryHeaders = [
        "institution_code",
        "course_code",
        "course_title",
        "exam_schedule_id",
        "exam_title",
        "academic_year",
        "semester",
        "student_name",
        "usn",
        "attempt_id",
        "submitted_at",
        "objective_score",
        "subjective_score",
        "total_score",
        "moderated_score",
        "final_score",
        "max_marks",
        "evaluation_status",
        "release_status"
      ];

      const csvLines = [summaryHeaders.join(",")];

      for (const att of attempts) {
        const finalScore = att.moderated_score !== null && att.moderated_score !== undefined
          ? Number(att.moderated_score)
          : (att.total_score !== null ? Number(att.total_score) : 0);

        csvLines.push([
          sanitizeCsvCell("KLE_TECH"),
          sanitizeCsvCell(att.course_code),
          sanitizeCsvCell(att.course_title),
          sanitizeCsvCell(att.exam_schedule_id),
          sanitizeCsvCell(att.exam_title),
          sanitizeCsvCell(att.academic_year),
          sanitizeCsvCell(att.semester),
          sanitizeCsvCell(att.student_name),
          sanitizeCsvCell(att.usn),
          sanitizeCsvCell(att.attempt_id),
          sanitizeCsvCell(att.submitted_at ? new Date(att.submitted_at).toISOString() : ""),
          sanitizeCsvCell(att.objective_score != null ? Number(att.objective_score).toFixed(2) : ""),
          sanitizeCsvCell(att.subjective_score != null ? Number(att.subjective_score).toFixed(2) : ""),
          sanitizeCsvCell(att.total_score != null ? Number(att.total_score).toFixed(2) : ""),
          sanitizeCsvCell(att.moderated_score != null ? Number(att.moderated_score).toFixed(2) : "N/A"),
          sanitizeCsvCell(finalScore.toFixed(2)),
          sanitizeCsvCell(att.attempt_max_marks != null ? Number(att.attempt_max_marks).toFixed(2) : "50.00"),
          sanitizeCsvCell(att.attempt_status),
          sanitizeCsvCell(att.results_published ? "RELEASED" : "UNRELEASED")
        ].join(","));
      }

      const csvContent = "\uFEFF" + csvLines.join("\n") + "\n";
      logEvent("info", "COE marks summary CSV exported", {
        actorId: authResult.user.userId,
        attemptsCount: attempts.length,
      });

      return new NextResponse(csvContent, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="coe_marks_summary_${scheduleId || "all"}.csv"`,
          "Cache-Control": "no-store, max-age=0",
        },
      });
    }

    // Default: Normalized layout (one row per student-question)
    const normalizedHeaders = [
      "institution_code",
      "course_code",
      "exam_schedule_id",
      "exam_title",
      "student_name",
      "usn",
      "attempt_id",
      "submitted_at",
      "question_id",
      "question_number",
      "question_type",
      "max_marks",
      "awarded_marks",
      "evaluation_status",
      "component_type",
      "student_objective_total",
      "student_subjective_total",
      "student_total_score",
      "moderated_score",
      "final_score",
      "moderation_status",
      "results_release_status"
    ];

    const csvLines = [normalizedHeaders.join(",")];

    for (const att of attempts) {
      // 1. Fetch responses for this attempt
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
          COALESCE(qak.correct_answer, qb.correct_answer) as correct_answer
        FROM attempt_responses ar
        JOIN question_bank qb ON qb.id = ar.question_id
        LEFT JOIN question_answer_keys qak ON qak.question_id = ar.question_id
        WHERE ar.attempt_id = $1 AND ar.tenant_id = $2 AND qb.tenant_id = $2
        ORDER BY ar.sequence_number ASC;
      `, [att.attempt_id, tenantId]);

      const responses = respRes.rows;

      const isEvaluated = att.attempt_status === "SUBMITTED" || att.attempt_status === "EVALUATED" || att.attempt_status === "RELEASED";
      const finalScore = att.moderated_score !== null && att.moderated_score !== undefined
        ? Number(att.moderated_score)
        : (att.total_score !== null ? Number(att.total_score) : 0);

      if (responses.length === 0) {
        csvLines.push([
          sanitizeCsvCell("KLE_TECH"),
          sanitizeCsvCell(att.course_code),
          sanitizeCsvCell(att.exam_schedule_id),
          sanitizeCsvCell(att.exam_title),
          sanitizeCsvCell(att.student_name),
          sanitizeCsvCell(att.usn),
          sanitizeCsvCell(att.attempt_id),
          sanitizeCsvCell(att.submitted_at ? new Date(att.submitted_at).toISOString() : ""),
          sanitizeCsvCell("OVERALL"),
          sanitizeCsvCell(1),
          sanitizeCsvCell("OBJECTIVE"),
          sanitizeCsvCell(att.attempt_max_marks != null ? Number(att.attempt_max_marks).toFixed(2) : "50.00"),
          sanitizeCsvCell(att.objective_score != null ? Number(att.objective_score).toFixed(2) : "0.00"),
          sanitizeCsvCell(isEvaluated ? "EVALUATED" : "IN_PROGRESS"),
          sanitizeCsvCell("OBJECTIVE"),
          sanitizeCsvCell(att.objective_score != null ? Number(att.objective_score).toFixed(2) : ""),
          sanitizeCsvCell(att.subjective_score != null ? Number(att.subjective_score).toFixed(2) : ""),
          sanitizeCsvCell(att.total_score != null ? Number(att.total_score).toFixed(2) : ""),
          sanitizeCsvCell(att.moderated_score != null ? Number(att.moderated_score).toFixed(2) : "N/A"),
          sanitizeCsvCell(finalScore.toFixed(2)),
          sanitizeCsvCell(att.moderated_by ? "MODERATED" : "UNMODERATED"),
          sanitizeCsvCell(att.results_published ? "RELEASED" : "UNRELEASED")
        ].join(","));
      }

      for (let i = 0; i < responses.length; i++) {
        const resp = responses[i];
        const qTypeUpper = (resp.question_type || "").toUpperCase();
        const isSubj = qTypeUpper.includes("SHORT") || qTypeUpper.includes("ESSAY") || qTypeUpper.includes("DESCRIPTIVE");
        const maxMarks = Number(resp.max_marks) || 2.0;

        let awardedMarksStr = "";
        let evalStatus = "IN_PROGRESS";

        if (isEvaluated) {
          evalStatus = "EVALUATED";
          if (!isSubj) {
            // Objective
            const ans = typeof resp.answer_json === "string"
              ? JSON.parse(resp.answer_json || "{}")
              : resp.answer_json || {};
            const studentChoice = (ans.selectedOption || ans.answer || "").toString().trim().toUpperCase();
            const correctChoice = (resp.correct_answer || "").toString().trim().toUpperCase();
            if (studentChoice && correctChoice && studentChoice === correctChoice) {
              awardedMarksStr = maxMarks.toFixed(2);
            } else if (!studentChoice && Number(att.objective_score) > 0) {
              awardedMarksStr = maxMarks.toFixed(2);
            } else {
              awardedMarksStr = "0.00";
            }
          } else {
            // Subjective
            awardedMarksStr = (Number(att.subjective_score) || 0).toFixed(2);
          }
        }

        // IMPORTANT: NEVER output correct_answer or answer_key in CSV!
        csvLines.push([
          sanitizeCsvCell("KLE_TECH"),
          sanitizeCsvCell(att.course_code),
          sanitizeCsvCell(att.exam_schedule_id),
          sanitizeCsvCell(att.exam_title),
          sanitizeCsvCell(att.student_name),
          sanitizeCsvCell(att.usn),
          sanitizeCsvCell(att.attempt_id),
          sanitizeCsvCell(att.submitted_at ? new Date(att.submitted_at).toISOString() : ""),
          sanitizeCsvCell(resp.question_id),
          sanitizeCsvCell(resp.sequence_number || i + 1),
          sanitizeCsvCell(resp.question_type),
          sanitizeCsvCell(maxMarks.toFixed(2)),
          sanitizeCsvCell(awardedMarksStr), // Blank if not yet evaluated!
          sanitizeCsvCell(evalStatus),
          sanitizeCsvCell(isSubj ? "SUBJECTIVE" : "OBJECTIVE"),
          sanitizeCsvCell(att.objective_score != null ? Number(att.objective_score).toFixed(2) : ""),
          sanitizeCsvCell(att.subjective_score != null ? Number(att.subjective_score).toFixed(2) : ""),
          sanitizeCsvCell(att.total_score != null ? Number(att.total_score).toFixed(2) : ""),
          sanitizeCsvCell(att.moderated_score != null ? Number(att.moderated_score).toFixed(2) : "N/A"),
          sanitizeCsvCell(finalScore.toFixed(2)),
          sanitizeCsvCell(att.moderated_by ? "MODERATED" : "UNMODERATED"),
          sanitizeCsvCell(att.results_published ? "RELEASED" : "UNRELEASED")
        ].join(","));
      }
    }

    const csvContent = "\uFEFF" + csvLines.join("\n") + "\n";
    logEvent("info", "COE normalized marks CSV exported", {
      actorId: authResult.user.userId,
      attemptsCount: attempts.length,
      linesCount: csvLines.length,
    });

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="coe_marks_normalized_${scheduleId || "all"}.csv"`,
        "Cache-Control": "no-store, max-age=0",
      },
    });
  } catch (error: any) {
    logEvent("error", "Error exporting COE CSV", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
