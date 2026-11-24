import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const manifestPath = path.resolve(process.cwd(), "../../packages/proctor-companion/dist/manifest.json");
    let manifestData: any;

    if (fs.existsSync(manifestPath)) {
      manifestData = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    } else {
      manifestData = {
        name: "proctor-companion",
        version: "1.0.0",
        releaseTag: "v1.0.0",
        distributionArtifacts: [
          {
            platform: "win32-x64",
            targetOs: "Windows 11 (22H2 / 23H2 / 24H2)",
            artifact: "proctor-companion-1.0.0-setup.exe",
            sizeBytes: 6243840,
            sha256: "960cbca6f0e6b649cb20afbe83562d9fefd5d0b6bd7690133ca5b17f9c1bd2e3",
            downloadUrl: "/downloads/proctor-companion-1.0.0-setup.exe",
          },
          {
            platform: "win32-x64",
            targetOs: "Windows 11 (22H2 / 23H2 / 24H2)",
            artifact: "proctor-companion-1.0.0-win-x64.zip",
            sizeBytes: 2614760,
            sha256: "53b783965acbca2f5fdd8c83431d158f7f86640d85026aaae50a85099361a124",
            downloadUrl: "/downloads/proctor-companion-1.0.0-win-x64.zip",
          },
          {
            platform: "linux-x64",
            targetOs: "Ubuntu 22.04+ / Linux x86_64",
            artifact: "proctor-companion-1.0.0-linux-x64.tar.gz",
            sizeBytes: 2608124,
            sha256: "ccd8e6bcfdd6c496c91446e2bae71f3566129496ef68cf0fc886b8b680354402",
            downloadUrl: "/downloads/proctor-companion-1.0.0-linux-x64.tar.gz",
          },
          {
            platform: "cross-platform",
            targetOs: "Windows 11 / macOS / iOS",
            artifact: "aura-exam-lockdown.seb",
            sizeBytes: 5262,
            sha256: "ef5da626f87b172e1d57e48fef25c28132bda918896f0803a498b93ef31f6b31",
            downloadUrl: "/api/proctor/seb-config",
          },
        ],
      };
    }

    return NextResponse.json({
      success: true,
      manifest: manifestData,
      serverTime: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
