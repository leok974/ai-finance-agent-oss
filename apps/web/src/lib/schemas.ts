import { z } from 'zod'

/**
 * ThresholdsSchema
 * Shared, minimal validation for Save Rule / forecast→budget flows.
 * minConfidence: 0–1 (default 0.66)
 * budgetPercent: 0–100 (optional)
 * limit: ≥ 0 currency units (optional)
 */
export const ThresholdsSchema = z.object({
  minConfidence: z.number().min(0).max(1).default(0.66),
  budgetPercent: z.number().min(0).max(100).optional(),
  limit: z.number().nonnegative().optional(),
})

export type Thresholds = z.infer<typeof ThresholdsSchema>
