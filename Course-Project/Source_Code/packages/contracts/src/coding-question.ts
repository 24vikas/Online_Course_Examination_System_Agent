import { z } from "zod";

export const CodingLanguageSchema = z.enum(["python", "cpp", "java"]);
const IoSchema = z.string().max(8192);
const ExampleSchema = z.object({ input: IoSchema, output: IoSchema }).strict();

export const PublicCodingProblemSchema = z.object({
  title: z.string().trim().min(1).max(255),
  statement: z.string().trim().min(1).max(20000),
  inputDescription: z.string().trim().min(1).max(4000),
  outputDescription: z.string().trim().min(1).max(4000),
  constraints: z.string().trim().min(1).max(4000),
  languages: z.array(CodingLanguageSchema).min(1).max(3).refine(
    languages => new Set(languages).size === languages.length, "Languages must be distinct",
  ),
  timeLimitMs: z.number().int().min(100).max(5000),
  memoryLimitKiB: z.number().int().min(16384).max(524288),
  examples: z.array(ExampleSchema).min(1).max(10),
  scoring: z.enum(["weighted", "all_or_nothing"]),
}).strict();

export const ProtectedCodingTestSetSchema = z.array(ExampleSchema.extend({
  weight: z.number().int().min(1).max(1000),
})).min(1).max(100);

export const CodingQuestionRevisionInputSchema = z.object({
  publicProblem: PublicCodingProblemSchema,
  hiddenTests: ProtectedCodingTestSetSchema,
}).strict();
