import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Use companion PIN exchange" }, { status: 410 });
}
