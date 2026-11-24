import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Companion state requires authenticated telemetry" }, { status: 410 });
}
