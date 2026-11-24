import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sebPath = path.resolve(process.cwd(), "../../packages/proctor-companion/dist/aura-exam-lockdown.seb");
    let sebContent: string;

    if (fs.existsSync(sebPath)) {
      sebContent = fs.readFileSync(sebPath, "utf-8");
    } else {
      const publicPath = path.resolve(process.cwd(), "public/downloads/aura-exam-lockdown.seb");
      if (fs.existsSync(publicPath)) {
        sebContent = fs.readFileSync(publicPath, "utf-8");
      } else {
        return NextResponse.json({ error: "SEB configuration not found" }, { status: 404 });
      }
    }

    return new NextResponse(sebContent, {
      status: 200,
      headers: {
        "Content-Type": "application/x-safeexambrowser; charset=utf-8",
        "Content-Disposition": 'attachment; filename="aura-exam-lockdown.seb"',
        "X-Checksum-SHA256": "ef5da626f87b172e1d57e48fef25c28132bda918896f0803a498b93ef31f6b31",
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
