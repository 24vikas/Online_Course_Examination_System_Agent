import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sameOrigin } from "@/lib/auth";
import { queryDb } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import { checkRateLimitAndConcurrency, releaseConcurrency } from "@/lib/rate-limit";

const input = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/), password: z.string().min(12).max(256) });
const limitKey = "institutional-activation";

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = checkRateLimitAndConcurrency(limitKey, { capacity: 10, refillRatePerSec: 0.2, maxConcurrent: 2 });
  if (!limit.allowed) return limit.errorResponse!;
  try {
    const parsed = input.safeParse(await req.json().catch(() => null));
    const tenantId = z.string().uuid().safeParse(process.env.AURA_AUTH_TENANT_ID);
    if (!parsed.success || !tenantId.success) {
      return NextResponse.json({ error: "Invalid activation credentials" }, { status: 400 });
    }
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
    const passwordHash = await hashPassword(parsed.data.password);
    const result = await queryDb(
      `WITH changed AS (
        UPDATE aura_password_credentials c
           SET password_hash = $2, activation_hash = NULL, activation_expires_at = NULL
          FROM tenant_memberships tm
         WHERE c.activation_hash = $1 AND c.activation_expires_at > clock_timestamp()
           AND c.disabled_at IS NULL AND tm.id = c.membership_id AND tm.tenant_id = $3
           AND (tm.role <> 'STUDENT' OR EXISTS (
             SELECT 1 FROM students s WHERE s.id = c.student_id AND s.tenant_id = tm.tenant_id AND s.is_active
           ))
         RETURNING c.membership_id
      ), revoked AS (
        UPDATE aura_web_sessions SET revoked_at = clock_timestamp()
         WHERE membership_id IN (SELECT membership_id FROM changed) AND revoked_at IS NULL
      )
      SELECT membership_id FROM changed`,
      [tokenHash, passwordHash, tenantId.data]
    );
    if (!result.rowCount) return NextResponse.json({ error: "Invalid activation credentials" }, { status: 401 });
    return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Activation unavailable" }, { status: 503 });
  } finally {
    releaseConcurrency(limitKey);
  }
}
