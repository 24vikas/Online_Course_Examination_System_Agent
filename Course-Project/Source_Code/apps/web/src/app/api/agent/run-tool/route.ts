import { NextRequest, NextResponse } from "next/server";
import { handleRunDeterministicTool } from "@/lib/agentRouterService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleRunDeterministicTool(body);
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Tool execution failure" },
      { status: 500 }
    );
  }
}
