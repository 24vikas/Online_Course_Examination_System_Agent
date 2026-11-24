PWERSONSimport { createHash, randomBytes } from "node:crypto";
import { queryDb } from "./db.ts";

export type UserRole = "COE_ADMIN" | "LECTURER" | "STUDENT" | "INVIGILATOR" | "SYSTEM_ADMIN";

export interface AuthenticatedUser {
  userId: string;
  email: string;
  role: UserRole;
  tenantId: string;
  membershipId: string;
}

export const SESSION_SECONDS = 8 * 60 * 60;
export const SESSION_COOKIE = "aura_session";
const isHttpsOrigin = Boolean(process.env.AURA_PUBLIC_ORIGIN?.startsWith("https://"));
export const sessionCookieOptions = {
  httpOnly: true,
  secure: isHttpsOrigin,
  sameSite: "lax" as const,
  path: "/",
};

export function sessionHash(request: Request): string | null {
  const match = request.headers.get("cookie")?.match(/(?:^|;\s*)aura_session=(aura_web_[a-f0-9]{64})(?:;|$)/);
  return match ? createHash("sha256").update(match[1]).digest("hex") : null;
}

export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const expected = process.env.AURA_PUBLIC_ORIGIN || new URL(request.url).origin;
  if (origin === expected) return true;
  try {
    const o = new URL(origin);

    // 1. Check against Host and X-Forwarded-Host headers (standard browser same-origin)
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (host) {
      const proto = request.headers.get("x-forwarded-proto") || (request.url.startsWith("https") ? "https" : "http");
      if (origin === `${proto}://${host}` || o.host === host) {
        return true;
      }
    }

    const e = new URL(expected);
    const isLocalO = o.hostname === "localhost" || o.hostname === "127.0.0.1";
    const isLocalE = e.hostname === "localhost" || e.hostname === "127.0.0.1";
    if (isLocalO && isLocalE && (o.port === e.port || (!o.port && !e.port))) {
      return true;
    }

    // 2. Allow same-port communication across local interfaces and private IPv4 subnets
    const isPrivateO =
      isLocalO ||
      /^192\.168\.\d+\.\d+$/.test(o.hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(o.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(o.hostname);

    const isPrivateE =
      isLocalE ||
      /^192\.168\.\d+\.\d+$/.test(e.hostname) ||
      /^10\.\d+\.\d+\.\d+$/.test(e.hostname) ||
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(e.hostname);

    if (isPrivateO && isPrivateE && (o.port === e.port || (!o.port && !e.port))) {
      return true;
    }
  } catch {}
  return false;
}

export async function issueSession(membershipId: string, passwordHash: string): Promise<string | null> {
  const token = `aura_web_${randomBytes(32).toString("hex")}`;
  const result = await queryDb(
    `INSERT INTO aura_web_sessions (token_hash, membership_id, expires_at)
     SELECT $1, membership_id, clock_timestamp() + $3 * interval '1 second'
       FROM aura_password_credentials
      WHERE membership_id = $2 AND password_hash = $4 AND disabled_at IS NULL
      FOR SHARE`,
    [createHash("sha256").update(token).digest("hex"), membershipId, SESSION_SECONDS, passwordHash]
  );
  return result.rowCount === 1 ? token : null;
}

export async function resolveAuth(request: Request): Promise<AuthenticatedUser | null> {
  const hash = sessionHash(request);
  if (!hash) return null;
  if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && !sameOrigin(request)) return null;
  try {
    const result = await queryDb<AuthenticatedUser>(
      `SELECT u.id AS "userId", u.email, tm.id AS "membershipId",
              tm.tenant_id AS "tenantId", tm.role
         FROM aura_web_sessions a
         JOIN aura_password_credentials c ON c.membership_id = a.membership_id
         JOIN tenant_memberships tm ON tm.id = a.membership_id
         JOIN users u ON u.id = tm.user_id
        WHERE a.token_hash = $1 AND a.expires_at > clock_timestamp()
          AND a.revoked_at IS NULL AND c.disabled_at IS NULL
          AND (tm.role <> 'STUDENT' OR EXISTS (
            SELECT 1 FROM students s WHERE s.id = c.student_id AND s.tenant_id = tm.tenant_id AND s.is_active
          ))`,
      [hash]
    );
    return result.rows[0] ?? null;
  } catch {
    return null;
  }
}

/**
 * Validates that an incoming request has an authenticated user with an authorized role.
 * Rejects unauthorized requests with HTTP 401 or HTTP 403.
 */
export async function assertAuthorized(
  request: Request,
  allowedRoles?: UserRole[]
): Promise<{ user: AuthenticatedUser } | { errorResponse: Response }> {
  const user = await resolveAuth(request);
  if (!user) {
    return {
      errorResponse: new Response(
        JSON.stringify({ success: false, error: "Unauthorized: Missing, invalid, or expired credentials." }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
    return {
      errorResponse: new Response(
        JSON.stringify({
          success: false,
          error: `Forbidden: Role '${user.role}' is not authorized for this resource. Required: ${allowedRoles.join(", ")}`,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    };
  }

  return { user };
}
