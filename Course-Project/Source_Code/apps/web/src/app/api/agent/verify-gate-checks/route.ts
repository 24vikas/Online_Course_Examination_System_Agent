import { NextRequest, NextResponse } from "next/server";
import { handleRunAllGateChecks } from "@/lib/agentRouterService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const checks = await handleRunAllGateChecks();
    return NextResponse.json({
      success: true,
      checks,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to run gate checks" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
