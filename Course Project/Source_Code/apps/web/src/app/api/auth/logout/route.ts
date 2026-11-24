import { NextRequest, NextResponse } from "next/server";
import { sameOrigin, sessionHash, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { queryDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const hash = sessionHash(req);
  if (hash) {
    await queryDb("UPDATE aura_web_sessions SET revoked_at = clock_timestamp() WHERE token_hash = $1", [hash]);
  }
  const response = NextResponse.json({ success: true });
  response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  return response;
}
