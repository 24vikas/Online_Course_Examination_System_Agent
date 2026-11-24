import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../../lib/db";
import { assertAuthorized } from "../../../../../../lib/auth";
import { logEvent } from "../../../../../../lib/logger";
import { AIProviderService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { providerId: string } }
) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const providerService = new AIProviderService({ query: queryDb });
    const provider = await providerService.getProvider(tenantId, params.providerId);
    if (!provider) {
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, provider });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { providerId: string } }
) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) return authResult.errorResponse;
    const tenantId = authResult.user.tenantId;

    const body = await req.json();
    body.id = params.providerId;

    const providerService = new AIProviderService({ query: queryDb });
    const saved = await providerService.saveProvider(tenantId, body);

    logEvent("info", "AI provider updated", {
      tenantId,
      providerId: saved.id,
      modelId: saved.modelId,
    });

    return NextResponse.json({ success: true, provider: saved });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

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
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
