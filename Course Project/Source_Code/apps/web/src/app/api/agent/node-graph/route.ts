import { NextRequest, NextResponse } from "next/server";
import { handleNodeGraphPipeline } from "@/lib/agentRouterService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleNodeGraphPipeline(body);
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Node graph pipeline failure" },
      { status: 500 }
    );
  }
}
