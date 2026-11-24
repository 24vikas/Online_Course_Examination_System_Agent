import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../../lib/db";
import { assertAuthorized } from "../../../../../lib/auth";
import { logEvent } from "../../../../../lib/logger";
import { AIProviderService } from "@exam-system/api";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) {
      logEvent("warn", "Unauthorized access to AI Providers list rejected");
      return authResult.errorResponse;
    }
    const tenantId = authResult.user.tenantId;

    const providerService = new AIProviderService({ query: queryDb });
    const providers = await providerService.listProviders(tenantId);

    // If no providers exist yet for this tenant, seed the default Ollama provider
    if (providers.length === 0) {
      await providerService.saveProvider(tenantId, {
        id: "ollama-local",
        providerType: "ollama",
        providerName: "Local Ollama (Host GTX 1650)",
        baseUrl: "http://127.0.0.1:11434/v1",
        modelId: "llama3.2:3b",
      });
      await providerService.activateProvider(tenantId, "ollama-local", true);
      const reloaded = await providerService.listProviders(tenantId);
      return NextResponse.json({ success: true, providers: reloaded });
    }

    return NextResponse.json({ success: true, providers });
  } catch (error: any) {
    logEvent("error", "Error listing AI providers", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authResult = await assertAuthorized(req, ["COE_ADMIN"]);
    if ("errorResponse" in authResult) {
      return authResult.errorResponse;
    }
    const tenantId = authResult.user.tenantId;
    const body = await req.json();

    const providerService = new AIProviderService({ query: queryDb });
    const saved = await providerService.saveProvider(tenantId, body);

    logEvent("info", "AI provider saved", {
      tenantId,
      providerId: saved.id,
      providerType: saved.providerType,
      modelId: saved.modelId,
    });

    return NextResponse.json({ success: true, provider: saved });
  } catch (error: any) {
    logEvent("error", "Error saving AI provider", { error: error.message });
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
