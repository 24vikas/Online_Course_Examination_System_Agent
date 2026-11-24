import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { DEMO_CONFIG } from "@/lib/constants";
import { getCoeDocumentDetails } from "@/lib/coeDocumentService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (!["COE_ADMIN", "LECTURER", "SYSTEM_ADMIN"].includes(authUser.role)) return NextResponse.json({error: "Forbidden"}, {status: 403});
    const tenantId = authUser.tenantId;

    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("id") || "doc_cs301_curriculum";

    const data = await getCoeDocumentDetails(tenantId, docId);
    return NextResponse.json({
      success: true,
      data,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to get document details" },
      { status: 500 }
    );
  }
}
