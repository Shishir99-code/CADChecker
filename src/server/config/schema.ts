import { z } from "zod";

/**
 * Shape locked by CONTEXT.md D-07: { rule, title, limit, unit, operator }.
 * `operator` lets the check engine compare generically (max/min) without
 * per-rule branching in individual check functions.
 */
export const RuleEntrySchema = z.object({
  rule: z.string().regex(/^R\d+$/),
  title: z.string().min(1),
  limit: z.number(),
  unit: z.string().min(1),
  operator: z.enum(["max", "min"]),
});

export const SeasonConfigSchema = z.object({
  season: z.string(),
  rules: z.array(RuleEntrySchema),
});

export type RuleEntry = z.infer<typeof RuleEntrySchema>;
export type SeasonConfig = z.infer<typeof SeasonConfigSchema>;
