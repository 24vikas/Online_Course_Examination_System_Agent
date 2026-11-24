import { NextRequest, NextResponse } from "next/server";
import { getSubjectBank } from "@/lib/academicIntelligenceService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const data = getSubjectBank();
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to get subject bank" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
