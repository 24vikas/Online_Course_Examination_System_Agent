import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authUser = await resolveAuth(req);
    const body = await req.json();
    const examId = body.examId || "26ECAC401";
    const role = authUser?.role || "LECTURER";
    const randHex = Math.random().toString(16).substring(2, 10).toUpperCase();
    const token = `KLE-${role.startsWith("COE") ? "COE" : "FACULTY"}-APPROVED-${examId}-${randHex}`;

    return NextResponse.json({
      success: true,
      token,
      examId,
      approverRole: role,
      approvedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Approval failure" },
      { status: 500 }
    );
  }
}
