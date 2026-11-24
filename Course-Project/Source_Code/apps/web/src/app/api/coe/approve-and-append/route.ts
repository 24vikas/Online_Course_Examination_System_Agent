import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { DEMO_CONFIG } from "@/lib/constants";
import { approveAndAppendCoeDocument } from "@/lib/coeDocumentService";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (authUser.role !== "COE_ADMIN") return NextResponse.json({error: "Forbidden"}, {status: 403});
    const tenantId = authUser.tenantId;
    const userId = authUser.userId;

    const body = await req.json();
    const result = await approveAndAppendCoeDocument(tenantId, userId, body);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to approve and append PDF" },
      { status: 500 }
    );
  }
}
