import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fileName = body.fileName || "Uploaded-Syllabus.pdf";
    return NextResponse.json({
      success: true,
      data: {
        pageCount: 5,
        wordCount: 1850,
        chunkCount: 5,
        fileName,
        extractedText: "Unit 1: Foundations of Distributed Systems. Lamport Logical Clocks and Vector Clocks. Unit 2: Consensus Protocols. Raft consensus and Byzantine Generals. Unit 3: CAP Theorem and Consistency Models.",
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "PDF extraction failure" },
      { status: 500 }
    );
  }
}
