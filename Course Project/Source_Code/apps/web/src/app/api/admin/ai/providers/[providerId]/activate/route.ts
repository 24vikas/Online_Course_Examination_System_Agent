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

    let setAsDefault = true;
    try {
      const body = await req.json();
      if (typeof body.setAsDefault === "boolean") {
        setAsDefault = body.setAsDefault;
      }
    } catch {}

    const providerService = new AIProviderService({ query: queryDb });
    const activated = await providerService.activateProvider(tenantId, params.providerId, setAsDefault);

    logEvent("info", "AI provider activated", {
      tenantId,
      providerId: params.providerId,
      isDefault: activated.isDefault,
    });

    return NextResponse.json({ success: true, provider: activated });
  } catch (error: any) {
    logEvent("error", "Error activating AI provider", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
