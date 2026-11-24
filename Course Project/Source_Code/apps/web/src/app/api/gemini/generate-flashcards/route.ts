import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  return NextResponse.json({
    success: true,
    data: {
      flashcards: [
        { front: "What is Lamport's Clock Condition?", back: "If event a causally precedes event b (a -> b), then L(a) < L(b)." },
        { front: "What is the Raft majority quorum size for N=5?", back: "3 nodes (floor(5/2) + 1)." },
        { front: "What fundamental trade-off does CAP Theorem dictate during partitions?", back: "Choose between Linearizability (Consistency) or 100% Availability." },
      ],
      count: 3,
    },
  });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
