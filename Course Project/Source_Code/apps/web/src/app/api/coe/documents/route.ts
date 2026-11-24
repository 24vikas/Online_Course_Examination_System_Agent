import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { DEMO_CONFIG } from "@/lib/constants";
import { listCoeDocuments } from "@/lib/coeDocumentService";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) return NextResponse.json({error: "Unauthorized"}, {status: 401});
    if (!["COE_ADMIN", "LECTURER", "SYSTEM_ADMIN"].includes(authUser.role)) return NextResponse.json({error: "Forbidden"}, {status: 403});
    const tenantId = authUser.tenantId;

    const docs = await listCoeDocuments(tenantId);
    return NextResponse.json({
      success: true,
      data: docs,
      count: docs.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to list COE documents" },
      { status: 500 }
    );
  }
}
