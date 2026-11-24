import { NextRequest, NextResponse } from "next/server";
import { createStudyNotes } from "@/lib/academicIntelligenceService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = await createStudyNotes(body);
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate notes" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const data = await createStudyNotes({});
  return NextResponse.json({ success: true, data });
}
