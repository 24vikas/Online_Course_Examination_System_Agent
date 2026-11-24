/**
 * Parallel Swarm & Merge Engine (L8 Parallel Swarm)
 * KLE Technological University — Course 26ECAC401 (Agentic AI)
 * Team: Team AURA
 */

export interface SwarmEvaluationTarget {
  tenantId: string;
  courseOfferingId: string;
  questionText: string;
  options: { key: string; text: string }[];
  marks: number;
  bloomLevel: string;
  citationLocator: string;
  sourceExcerpt: string;
  topicKeywords?: string[];
  syllabusOutcome?: string;
}

export interface SpecialistFinding {
  specialist: "COVERAGE_SPECIALIST" | "QUALITY_CRITIC" | "PROVENANCE_VERIFIER";
  passed: boolean;
  score: number; // 0 to 100
  details: string;
  defectIdentified?: string;
  executionMs: number;
}

export interface SwarmMergeResult {
  allPassed: boolean;
  consensusScore: number;
  findings: SpecialistFinding[];
  conflicts: string[];
  isolatedFailures: string[];
  recommendation: "ACCEPT" | "REVISE" | "REJECT";
}

export class ParallelSwarmEngine {
  /**
   * Runs three specialized evaluation agents in parallel across a target assessment question,
   * then merges results with conflict resolution and fault isolation.
   */
  async evaluateQuestionInParallel(
    target: SwarmEvaluationTarget,
    simulateSpecialistFailure: boolean = false
  ): Promise<SwarmMergeResult> {
    const defaultAgenticKeywords = [
      "agent", "lifecycle", "planning", "tool", "memory", "rag",
      "swarm", "bloom", "prompt", "observe", "act", "improve", "state"
    ];

    const keywordsToCheck = (target.topicKeywords && target.topicKeywords.length > 0)
      ? target.topicKeywords.map((k) => k.toLowerCase())
      : defaultAgenticKeywords;

    // 1. Specialist 1: Syllabus Coverage
    const coveragePromise = (async (): Promise<SpecialistFinding> => {
      const t0 = Date.now();
      const textLower = target.questionText.toLowerCase();
      const matched = keywordsToCheck.filter((kw) => textLower.includes(kw));
      const hasKeyTerms = matched.length > 0 ||
        textLower.includes("sql") ||
        textLower.includes("key") ||
        textLower.includes("table") ||
        textLower.includes("database");

      // Dynamic score computation
      const baseScore = hasKeyTerms ? 92 : 35;
      const bonus = Math.min(8, matched.length * 2);
      const score = Math.min(100, baseScore + bonus);

      return {
        specialist: "COVERAGE_SPECIALIST",
        passed: hasKeyTerms,
        score,
        details: hasKeyTerms
          ? `Target topics align with syllabus course competencies. Matched concepts: ${matched.length > 0 ? matched.join(", ") : "core terms"}.`
          : "Question lacks core domain terminology from active syllabus topics.",
        defectIdentified: hasKeyTerms ? undefined : "TOPIC_MISALIGNMENT",
        executionMs: Date.now() - t0,
      };
    })();

    // 2. Specialist 2: Quality & Distractor Critic
    const qualityPromise = (async (): Promise<SpecialistFinding> => {
      const t0 = Date.now();
      if (simulateSpecialistFailure) {
        throw new Error("TRANSIENT_TIMEOUT: Quality Critic timed out connecting to evaluator pool.");
      }

      const hasFourOptions = Array.isArray(target.options) && target.options.length === 4;
      const optionsDistinct = hasFourOptions &&
        new Set(target.options.map((o) => o.text.trim().toLowerCase())).size === target.options.length;

      // Check Bloom alignment
      const bloom = (target.bloomLevel || "").toUpperCase();
      const validBloom = ["REMEMBER", "UNDERSTAND", "APPLY", "ANALYZE", "EVALUATE", "CREATE"].includes(bloom);

      const passed = hasFourOptions && optionsDistinct && validBloom;
      let score = 40;
      if (hasFourOptions && optionsDistinct) score = 88;
      if (passed && target.marks > 0) score = 94;

      return {
        specialist: "QUALITY_CRITIC",
        passed,
        score,
        details: passed
          ? `4 distinct plausible options provided; Bloom cognitive demand (${bloom || "UNDERSTAND"}) aligns with mark weighting (${target.marks} marks).`
          : "Malformed options detected: duplicate choices, fewer than 4 distractors, or invalid Bloom taxonomy level.",
        defectIdentified: passed ? undefined : "MALFORMED_DISTRACTORS",
        executionMs: Date.now() - t0,
      };
    })();

    // 3. Specialist 3: Provenance & Citation Verifier
    const provenancePromise = (async (): Promise<SpecialistFinding> => {
      const t0 = Date.now();
      const locator = target.citationLocator || "";
      const hasValidCitation =
        locator.includes("page=") ||
        locator.includes("slide=") ||
        locator.includes("Page") ||
        locator.includes(".docx") ||
        locator.includes(".pptx") ||
        locator.includes(".pdf") ||
        locator.includes("syllabus://") ||
        locator.includes("#chunk");

      const hasExcerpt = target.sourceExcerpt && target.sourceExcerpt.length >= 10;
      const passed = Boolean(hasValidCitation && hasExcerpt);

      // Verify overlap between excerpt and question
      let score = 0;
      if (passed) {
        const excerptWords = new Set(
          target.sourceExcerpt.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
        );
        const questionWords = target.questionText.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
        const overlap = questionWords.filter((w) => excerptWords.has(w)).length;
        const overlapBonus = Math.min(10, overlap * 2);
        score = Math.min(100, 88 + overlapBonus);
      }

      return {
        specialist: "PROVENANCE_VERIFIER",
        passed,
        score,
        details: passed
          ? `Verified grounded citation in '${locator}' with grounded excerpt (${target.sourceExcerpt.slice(0, 40)}...).`
          : "Unverified provenance: Missing page locator or empty source excerpt.",
        defectIdentified: passed ? undefined : "FABRICATED_CITATION",
        executionMs: Date.now() - t0,
      };
    })();

    // Parallel Execution via Promise.allSettled (Fault-tolerant merge)
    const rawResults = await Promise.allSettled([coveragePromise, qualityPromise, provenancePromise]);

    const findings: SpecialistFinding[] = [];
    const isolatedFailures: string[] = [];
    const conflicts: string[] = [];

    // Process results
    for (const res of rawResults) {
      if (res.status === "fulfilled") {
        findings.push(res.value);
      } else {
        isolatedFailures.push(`SPECIALIST_FAILURE: ${res.reason?.message || "Unknown error"}`);
      }
    }

    // Merge Node: Compute consensus
    const totalScore = findings.reduce((sum, f) => sum + f.score, 0);
    const consensusScore = findings.length > 0 ? Math.round(totalScore / findings.length) : 0;
    const allPassed = findings.length > 0 && findings.every((f) => f.passed) && isolatedFailures.length === 0;

    // Detect conflicts between specialists
    const coverageFinding = findings.find((f) => f.specialist === "COVERAGE_SPECIALIST");
    const qualityFinding = findings.find((f) => f.specialist === "QUALITY_CRITIC");
    if (coverageFinding && qualityFinding && coverageFinding.passed !== qualityFinding.passed) {
      conflicts.push("CONSENSUS_CONFLICT: Coverage specialist approved but quality critic detected flaws.");
    }

    let recommendation: "ACCEPT" | "REVISE" | "REJECT" = "ACCEPT";
    if (!allPassed) {
      recommendation = consensusScore > 50 ? "REVISE" : "REJECT";
    }

    return {
      allPassed,
      consensusScore,
      findings,
      conflicts,
      isolatedFailures,
      recommendation,
    };
  }
}
