import { NextRequest, NextResponse } from "next/server";
import { handleAcademicCopilotChat } from "@/lib/academicIntelligenceService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const data = await handleAcademicCopilotChat(body);
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Academic chat failure" },
      { status: 500 }
    );
  }
}
