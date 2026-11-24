import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../../../lib/db";
import { assertAuthorized } from "../../../../../../../lib/auth";
import { logEvent } from "../../../../../../../lib/logger";
import { AIProviderService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { providerId: string } }
) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const providerService = new AIProviderService({ query: queryDb });
    const updated = await providerService.removeCredentials(tenantId, params.providerId);

    logEvent("info", "AI provider credentials removed", {
      tenantId,
      providerId: params.providerId,
    });

    return NextResponse.json({ success: true, provider: updated });
  } catch (error: any) {
    logEvent("error", "Error removing AI provider credentials", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
