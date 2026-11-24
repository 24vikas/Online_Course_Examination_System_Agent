import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { StudentImportService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;
    const adminUserId = authResult.user.userId;

    const body = await req.json();
    const { validation, columnMapping, semester } = body;

    if (!validation || !validation.fileSha256 || !validation.validRows) {
      return NextResponse.json(
        { error: "Valid validation result payload is required to commit." },
        { status: 400 }
      );
    }

    const service = new StudentImportService({ query: queryDb });
    const result = await service.commitBatch(
      tenantId,
      adminUserId,
      validation,
      columnMapping || {},
      semester ? Number(semester) : 7
    );

    logEvent("info", "Student import batch committed", {
      tenantId,
      batchId: result.batchId,
      status: result.status,
      importedCount: result.importedCount,
    });

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    logEvent("error", "Error committing student import batch", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
