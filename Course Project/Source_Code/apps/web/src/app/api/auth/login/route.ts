import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { queryDb } from "@/lib/db";
import { issueSession, sameOrigin, SESSION_COOKIE, SESSION_SECONDS, sessionCookieOptions } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";
import { checkRateLimitAndConcurrency, releaseConcurrency } from "@/lib/rate-limit";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";
const input = z.object({
  identifier: z.string().trim().min(1).max(255),
  password: z.string().min(1).max(256),
});
const limitKey = "institutional-login";

function invalid() {
  logEvent("warn", "Institutional login rejected");
  return NextResponse.json({ error: "Invalid institutional credentials" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const limit = checkRateLimitAndConcurrency(limitKey, { capacity: 20, refillRatePerSec: 1, maxConcurrent: 4 });
  if (!limit.allowed) return limit.errorResponse!;
  try {
    const parsed = input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return invalid();
    const tenantId = process.env.AURA_AUTH_TENANT_ID;
    if (!tenantId || !z.string().uuid().safeParse(tenantId).success) {
      return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
    }
    const identifier = parsed.data.identifier.toLowerCase();
    const result = await queryDb(
      `SELECT u.id, u.email, tm.id AS membership_id, tm.role, c.password_hash,
              s.institutional_student_id AS usn, trim(concat_ws(' ', s.first_name, s.last_name)) AS student_name
         FROM aura_password_credentials c
         JOIN tenant_memberships tm ON tm.id = c.membership_id
         JOIN users u ON u.id = tm.user_id
         LEFT JOIN students s ON s.id = c.student_id AND s.tenant_id = tm.tenant_id AND s.is_active
        WHERE tm.tenant_id = $1 AND c.disabled_at IS NULL
          AND ((tm.role = 'STUDENT' AND (lower(trim(s.institutional_student_id)) = $2 OR lower(u.email) = $2))
            OR (tm.role <> 'STUDENT' AND lower(u.email) = $2))
        LIMIT 2`,
      [tenantId, identifier]
    );
    const user = result.rows.length === 1 ? result.rows[0] : null;
    if (!await verifyPassword(parsed.data.password, user?.password_hash) || !user) return invalid();

    const token = await issueSession(user.membership_id, user.password_hash);
    if (!token) return invalid();
    const redirectUrl = ({
      STUDENT: "/student",
      LECTURER: "/faculty",
      COE_ADMIN: "/coe",
      SYSTEM_ADMIN: "/coe",
      INVIGILATOR: "/invigilator/live",
    } as Record<string, string>)[user.role];
    const response = NextResponse.json({
      success: true,
      user: { id: user.id, email: user.email, tenantId, role: user.role,
        displayName: user.student_name || user.email.split("@")[0], usn: user.usn, redirectUrl },
    }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(SESSION_COOKIE, token, { ...sessionCookieOptions, maxAge: SESSION_SECONDS });
    logEvent("info", "Institutional login accepted", { userId: user.id, tenantId });
    return response;
  } catch {
    logEvent("error", "Institutional login unavailable");
    return NextResponse.json({ error: "Authentication unavailable" }, { status: 503 });
  } finally {
    releaseConcurrency(limitKey);
  }
}
