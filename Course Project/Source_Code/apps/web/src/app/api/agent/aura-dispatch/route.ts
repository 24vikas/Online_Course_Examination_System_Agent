import { NextRequest, NextResponse } from "next/server";
import { handleAuraToolDispatch } from "@/lib/agentRouterService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await handleAuraToolDispatch(body);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "AURA dispatch failure" },
      { status: 400 }
    );
  }
}
