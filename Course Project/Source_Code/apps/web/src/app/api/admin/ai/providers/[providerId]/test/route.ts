import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../../../lib/db";
import { assertAuthorized } from "../../../../../../../lib/auth";
import { logEvent } from "../../../../../../../lib/logger";
import { AIProviderService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { providerId: string } }
) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const providerService = new AIProviderService({ query: queryDb });
    const result = await providerService.testConnection(tenantId, params.providerId);

    logEvent("info", "AI provider connection test executed", {
      tenantId,
      providerId: params.providerId,
      healthy: result.healthy,
      latencyMs: result.latencyMs,
    });

    return NextResponse.json({ success: true, testResult: result });
  } catch (error: any) {
    logEvent("error", "Error executing AI provider test", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
