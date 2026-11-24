import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";
import { queryDb } from "@/lib/db";
import { logEvent } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    if (!authUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let displayName = authUser.email.split("@")[0];
    let usn: string | undefined;

    if (authUser.role === "STUDENT") {
      const sRes = await queryDb(
        `SELECT institutional_student_id, first_name, last_name FROM students WHERE id = (SELECT student_id FROM aura_password_credentials WHERE membership_id = $1) AND tenant_id = $2`,
        [authUser.membershipId, authUser.tenantId]
      );
      if (sRes.rows.length > 0) {
        usn = sRes.rows[0].institutional_student_id;
        displayName = `${sRes.rows[0].first_name || ""} ${sRes.rows[0].last_name || ""}`.trim() || usn;
      }
    } else if (authUser.role === "COE_ADMIN" || authUser.role === "SYSTEM_ADMIN") {
      displayName = "Controller of Examinations";
    } else if (authUser.role === "LECTURER") {
      displayName = "Faculty Lead";
    } else if (authUser.role === "INVIGILATOR") {
      displayName = "Exam Invigilator";
    }

    let redirectUrl = "/student";
    if (authUser.role === "COE_ADMIN" || authUser.role === "SYSTEM_ADMIN") {
      redirectUrl = "/coe";
    } else if (authUser.role === "LECTURER") {
      redirectUrl = "/faculty";
    } else if (authUser.role === "INVIGILATOR") {
      redirectUrl = "/invigilator/live";
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authUser.userId,
        email: authUser.email,
        role: authUser.role,
        tenantId: authUser.tenantId,
        displayName,
        usn,
        redirectUrl,
      },
    });
  } catch (error: any) {
    logEvent("error", "Exception in /api/auth/me", { error: error.message });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
