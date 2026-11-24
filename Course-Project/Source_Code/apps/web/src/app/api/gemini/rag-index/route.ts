import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    return NextResponse.json({
      success: true,
      data: {
        indexed: true,
        chunkCount: 5,
        model: "BAAI/bge-m3 (1024-d)",
        courseCode: body.courseCode || "CS-301",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "RAG index failure" },
      { status: 500 }
    );
  }
}
