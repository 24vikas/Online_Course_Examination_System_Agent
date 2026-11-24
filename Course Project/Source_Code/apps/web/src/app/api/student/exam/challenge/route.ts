import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { ProctorCompanionService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["STUDENT", "COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;
    const studentUserId = authResult.user.userId;

    const body = await req.json().catch(() => ({}));
    const { attemptId, ttlSeconds } = body;

    if (!attemptId) {
      return NextResponse.json({ error: "attemptId is required" }, { status: 400 });
    }

    // Resolve student record
    let studentId = studentUserId;
    const studRes = await queryDb(
      `SELECT id FROM students WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
      [tenantId, studentUserId]
    );
    if (studRes.rows.length > 0) {
      studentId = studRes.rows[0].id;
    }

    const service = new ProctorCompanionService({ query: queryDb });
    const challenge = await service.generateChallenge(
      tenantId,
      attemptId,
      studentId,
      typeof ttlSeconds === "number" && ttlSeconds > 0 ? ttlSeconds : 300
    );

    logEvent("info", "Proctor companion challenge generated", {
      tenantId,
      attemptId,
      studentId,
      ttlSeconds: challenge.ttlSeconds,
      expiresAt: challenge.expiresAt,
    });

    return NextResponse.json({
      success: true,
      ...challenge,
    });
  } catch (error: any) {
    logEvent("error", "Error generating proctor companion challenge", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
