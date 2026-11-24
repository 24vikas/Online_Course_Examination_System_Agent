import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { StudentImportService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;

    const rootDir = process.cwd();
    const service = new StudentImportService({ query: queryDb });
    const discovered = service.scanRegisteredDirectory(rootDir, "Registered");

    return NextResponse.json({
      success: true,
      files: discovered,
      count: discovered.length,
    });
  } catch (error: any) {
    logEvent("error", "Error scanning Registered CSV files", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
