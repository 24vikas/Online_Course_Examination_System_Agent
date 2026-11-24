import {
  requireProctoredCodingAttempt as authoritativeGuard,
  type ProctoredAttemptAuthorization as AuthAuthZ,
} from "../proctoring/proctorAuthorization.ts";

export type CodingAction = "read" | "autosave" | "run" | "submit";

export type ProctoredAttemptAuthorization = AuthAuthZ;

export type ProctoredAttemptGuard = (
  request: Request,
  attemptId: string,
  action: CodingAction,
) => Promise<ProctoredAttemptAuthorization>;

export class CodingIntegrationUnavailable extends Error {
  readonly status = 503;
}

// Authoritative shared guard connected to live proctor companion heartbeat
export const requireProctoredCodingAttempt: ProctoredAttemptGuard = authoritativeGuard;

export type JudgeOutcome = "accepted" | "wrong_answer" | "timeout" | "memory_limit" | "runtime_error" | "compile_error" | "infrastructure_error";

export function calculateCodingMarks(
  maxMarksHundredths: number,
  rule: "weighted" | "all_or_nothing",
  outcomes: readonly { weight: number; outcome: JudgeOutcome }[],
): number | null {
  if (!Number.isSafeInteger(maxMarksHundredths) || maxMarksHundredths < 1 ||
      outcomes.length < 1 || outcomes.length > 100 ||
      outcomes.some(item => !Number.isSafeInteger(item.weight) || item.weight < 1 || item.weight > 1000)) {
    throw new RangeError("Invalid approved scoring configuration");
  }
  if (outcomes.some(item => item.outcome === "infrastructure_error")) return null;
  if (rule === "all_or_nothing") {
    return outcomes.every(item => item.outcome === "accepted") ? maxMarksHundredths : 0;
  }
  const totalWeight = outcomes.reduce((sum,item) => sum + item.weight,0);
  const passedWeight = outcomes.reduce((sum,item) => sum + (item.outcome === "accepted" ? item.weight : 0),0);
  return Number((BigInt(maxMarksHundredths) * BigInt(passedWeight) + BigInt(Math.floor(totalWeight / 2))) / BigInt(totalWeight));
}
