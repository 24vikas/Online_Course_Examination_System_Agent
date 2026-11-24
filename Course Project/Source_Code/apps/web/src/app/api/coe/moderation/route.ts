import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "@/lib/db";
import { DEMO_CONFIG } from "@/lib/constants";
import { resolveAuth } from "@/lib/auth";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error:"Unauthorized"}, {status:401});
    if (!["COE_ADMIN","SYSTEM_ADMIN"].includes(authUser.role)) return NextResponse.json({error:"Forbidden"}, {status:403});
    const tenantId = authUser.tenantId;

    const { searchParams } = new URL(req.url);
    const scheduleId = searchParams.get("scheduleId");

    let queryStr = `
      SELECT 
        COUNT(*) as total_candidates,
        AVG(total_score) as avg_score,
        MIN(total_score) as min_score,
        MAX(total_score) as max_score,
        STDDEV(total_score) as stddev_score,
        COUNT(*) FILTER (WHERE total_score >= 20.0) as pass_count,
        COUNT(*) FILTER (WHERE moderated_score IS NOT NULL) as moderated_count,
        COUNT(*) FILTER (WHERE status = 'RELEASED') as released_count
      FROM exam_attempts
      WHERE tenant_id = $1 AND total_score IS NOT NULL
    `;

    const params: any[] = [tenantId];
    if (scheduleId) {
      queryStr += ` AND exam_schedule_id = $2`;
      params.push(scheduleId);
    }

    const statRes = await queryDb(queryStr, params);
    const stats = statRes.rows[0];

    const total = Number(stats.total_candidates) || 0;
    const passCount = Number(stats.pass_count) || 0;
    const passRate = total > 0 ? ((passCount / total) * 100).toFixed(1) : "0.0";

    // Candidate breakdown list
    let listQuery = `
      SELECT 
        ea.id as attempt_id,
        ea.status,
        ea.objective_score,
        ea.subjective_score,
        ea.total_score,
        ea.moderated_score,
        ea.moderation_notes,
        s.institutional_student_id as usn,
        COALESCE(s.first_name || ' ' || s.last_name, u.email, 'Candidate') as student_name
      FROM exam_attempts ea
      LEFT JOIN users u ON u.id = ea.student_id
      LEFT JOIN students s ON s.tenant_id = ea.tenant_id AND s.email = u.email
      WHERE ea.tenant_id = $1 AND ea.total_score IS NOT NULL
    `;
    const listParams: any[] = [tenantId];
    if (scheduleId) {
      listQuery += ` AND ea.exam_schedule_id = $2`;
      listParams.push(scheduleId);
    }
    listQuery += ` ORDER BY ea.total_score DESC LIMIT 100`;

    const listRes = await queryDb(listQuery, listParams);

    return NextResponse.json({
      success: true,
      statistics: {
        totalCandidates: total,
        averageScore: Number(Number(stats.avg_score || 0).toFixed(2)),
        minimumScore: Number(stats.min_score || 0),
        maximumScore: Number(stats.max_score || 0),
        standardDeviation: Number(Number(stats.stddev_score || 0).toFixed(2)),
        passCount,
        passRate: Number(passRate),
        moderatedCount: Number(stats.moderated_count) || 0,
        releasedCount: Number(stats.released_count) || 0,
      },
      candidates: listRes.rows.map((r: any) => ({
        attemptId: r.attempt_id,
        usn: r.usn || "DEMO001",
        studentName: r.student_name,
        status: r.status,
        objectiveScore: Number(r.objective_score) || 0,
        subjectiveScore: Number(r.subjective_score) || 0,
        rawTotalScore: Number(r.total_score) || 0,
        moderatedScore: r.moderated_score !== null ? Number(r.moderated_score) : null,
        moderationNotes: r.moderation_notes,
      })),
    });
  } catch (error: any) {
    logEvent("error", "Error getting moderation statistics", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
