import { NextRequest, NextResponse } from "next/server";
import { createSampleCurriculumPdf } from "@/lib/coeDocumentService";
import { resolveAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (authUser.role !== "COE_ADMIN" && authUser.role !== "LECTURER") {
      return NextResponse.json({ error: "Forbidden: Only COE_ADMIN or LECTURER can generate sample PDFs" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const courseCode = searchParams.get("courseCode") || "CS-301";
    const title = searchParams.get("title") || "Distributed Systems & Cloud Computing";

    const sample = createSampleCurriculumPdf(courseCode, title);
    return NextResponse.json({
      success: true,
      data: sample,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate sample PDF" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
