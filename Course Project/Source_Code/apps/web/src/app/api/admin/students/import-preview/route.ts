import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { StudentImportService } from "@exam-system/api";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN", "LECTURER"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;

    const body = await req.json();
    const { filename, rawCsvContent, columnMapping, semester, delimiter } = body;

    let content = rawCsvContent;
    if (!content && filename) {
      const fullPath = path.resolve(process.cwd(), "Registered", filename);
      if (fs.existsSync(fullPath)) {
        content = fs.readFileSync(fullPath, "utf-8");
      }
    }

    if (!content) {
      return NextResponse.json(
        { error: "Either filename in Registered/ or rawCsvContent must be provided." },
        { status: 400 }
      );
    }

    const service = new StudentImportService({ query: queryDb });
    const mapping = columnMapping || { usn: "USN", name: "Student Name", email: "Email" };
    const defaultSemester = semester ? Number(semester) : 7;

    const validation = service.validateCsvContent(
      content,
      filename || "uploaded.csv",
      mapping,
      defaultSemester,
      delimiter || ","
    );

    logEvent("info", "Student CSV preview validated", {
      filename: validation.filename,
      totalRows: validation.totalRows,
      validRows: validation.validRowsCount,
      invalidRows: validation.invalidRowsCount,
    });

    return NextResponse.json({
      success: true,
      validation,
    });
  } catch (error: any) {
    logEvent("error", "Error generating student CSV preview", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
