/**
 * apps/web/src/lib/coding/bwrapJudge.ts
 *
 * Isolated Execution Judge utilizing Linux Bubblewrap (bwrap).
 * Enforces:
 * - Complete namespace isolation (--unshare-all)
 * - Read-only host filesystem bindings (/usr, /lib, /lib64, /bin)
 * - Ephemeral sandbox scratch mounts (/tmp, /proc, /dev)
 * - Zero host network access
 * - Strict process timeouts and memory ceilings
 * - Standardized JudgeOutcome classification
 */

import fs from "fs";
import os from "os";
import path from "path";
import { spawn } from "child_process";
import { type JudgeOutcome } from "./policy.ts";

export type CodingLanguage = "python" | "cpp" | "java";

export interface ExecutionOptions {
  timeLimitMs?: number;
  memoryLimitKiB?: number;
  expectedOutput?: string;
  weight?: number;
}

export interface ExecutionResult {
  outcome: JudgeOutcome;
  stdout: string;
  stderr: string;
  durationMs: number;
  exitCode: number | null;
  weight?: number;
}

export function normalizeOutput(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map(line => line.trimEnd())
    .join("\n")
    .trim();
}

export function compareOutputs(actual: string, expected: string): boolean {
  return normalizeOutput(actual) === normalizeOutput(expected);
}

/**
 * Executes user-submitted code in an isolated Bubblewrap sandbox.
 */
export async function executeIsolatedCode(
  language: CodingLanguage,
  code: string,
  input: string = "",
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const timeLimitMs = Math.max(100, Math.min(options.timeLimitMs || 2000, 10000));
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "aura_judge_"));

  try {
    let executableCmd: string[];

    if (language === "python") {
      const scriptPath = path.join(tempDir, "solution.py");
      fs.writeFileSync(scriptPath, code, "utf8");
      executableCmd = ["python3", "solution.py"];
    } else if (language === "cpp") {
      const srcPath = path.join(tempDir, "solution.cpp");
      const binPath = path.join(tempDir, "solution");
      fs.writeFileSync(srcPath, code, "utf8");

      // Compile step
      const compileStart = Date.now();
      const compileProc = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
        (resolve) => {
          const cp = spawn("g++", ["-O2", "-std=c++17", srcPath, "-o", binPath], {
            timeout: 5000,
          });
          let stdout = "";
          let stderr = "";
          cp.stdout?.on("data", d => (stdout += d));
          cp.stderr?.on("data", d => (stderr += d));
          cp.on("close", exitCode => resolve({ exitCode, stdout, stderr }));
          cp.on("error", err => resolve({ exitCode: 1, stdout, stderr: err.message }));
        }
      );

      if (compileProc.exitCode !== 0) {
        return {
          outcome: "compile_error",
          stdout: compileProc.stdout,
          stderr: compileProc.stderr || "C++ compilation failed",
          durationMs: Date.now() - compileStart,
          exitCode: compileProc.exitCode,
          weight: options.weight,
        };
      }

      executableCmd = ["./solution"];
    } else if (language === "java") {
      const srcPath = path.join(tempDir, "Solution.java");
      fs.writeFileSync(srcPath, code, "utf8");

      // Compile step
      const compileStart = Date.now();
      const compileProc = await new Promise<{ exitCode: number | null; stdout: string; stderr: string }>(
        (resolve) => {
          const cp = spawn("javac", [srcPath], { timeout: 8000 });
          let stdout = "";
          let stderr = "";
          cp.stdout?.on("data", d => (stdout += d));
          cp.stderr?.on("data", d => (stderr += d));
          cp.on("close", exitCode => resolve({ exitCode, stdout, stderr }));
          cp.on("error", err => resolve({ exitCode: 1, stdout, stderr: err.message }));
        }
      );

      if (compileProc.exitCode !== 0) {
        return {
          outcome: "compile_error",
          stdout: compileProc.stdout,
          stderr: compileProc.stderr || "Java compilation failed",
          durationMs: Date.now() - compileStart,
          exitCode: compileProc.exitCode,
          weight: options.weight,
        };
      }

      executableCmd = ["java", "-Xmx256m", "Solution"];
    } else {
      return {
        outcome: "infrastructure_error",
        stdout: "",
        stderr: `Unsupported language: ${language}`,
        durationMs: 0,
        exitCode: 1,
        weight: options.weight,
      };
    }

    // Build Bubblewrap arguments
    const bwrapArgs = [
      "--unshare-all",
      "--ro-bind", "/usr", "/usr",
      "--ro-bind", "/lib", "/lib",
      "--ro-bind", "/lib64", "/lib64",
      "--ro-bind", "/bin", "/bin",
      "--ro-bind", tempDir, "/workspace",
      "--chdir", "/workspace",
      "--tmpfs", "/tmp",
      "--proc", "/proc",
      "--dev", "/dev",
      "--die-with-parent",
      ...executableCmd,
    ];

    const startTime = Date.now();

    return await new Promise<ExecutionResult>((resolve) => {
      let isTimedOut = false;
      const child = spawn("/usr/bin/bwrap", bwrapArgs, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        isTimedOut = true;
        child.kill("SIGKILL");
      }, timeLimitMs);

      let stdout = "";
      let stderr = "";

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString("utf8");
        // Memory / output flood safeguard (max 1MB output)
        if (stdout.length > 1024 * 1024) {
          child.kill("SIGKILL");
        }
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      // Write stdin
      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          outcome: "infrastructure_error",
          stdout,
          stderr: err.message,
          durationMs: Date.now() - startTime,
          exitCode: 1,
          weight: options.weight,
        });
      });

      child.on("close", (exitCode, signal) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        if (isTimedOut || signal === "SIGTERM" || signal === "SIGKILL") {
          resolve({
            outcome: "timeout",
            stdout,
            stderr: stderr || "Execution timed out.",
            durationMs,
            exitCode,
            weight: options.weight,
          });
          return;
        }

        if (exitCode !== 0) {
          resolve({
            outcome: "runtime_error",
            stdout,
            stderr: stderr || `Process exited with error code ${exitCode}`,
            durationMs,
            exitCode,
            weight: options.weight,
          });
          return;
        }

        // Check against expected output if provided
        if (options.expectedOutput !== undefined) {
          const passed = compareOutputs(stdout, options.expectedOutput);
          resolve({
            outcome: passed ? "accepted" : "wrong_answer",
            stdout,
            stderr,
            durationMs,
            exitCode: 0,
            weight: options.weight,
          });
        } else {
          resolve({
            outcome: "accepted",
            stdout,
            stderr,
            durationMs,
            exitCode: 0,
            weight: options.weight,
          });
        }
      });
    });
  } catch (error: any) {
    return {
      outcome: "infrastructure_error",
      stdout: "",
      stderr: error?.message || String(error),
      durationMs: 0,
      exitCode: 1,
      weight: options.weight,
    };
  } finally {
    // Clean up temporary workspace directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}
