import { z } from 'zod'

export const ThresholdsSchema = z.object({
  minConfidence: z.number().min(0).max(1).default(0.66),
  budgetPercent: z.number().min(0).max(100).optional(),
  limit: z.number().nonnegative().optional(),
})

export type Thresholds = z.infer<typeof ThresholdsSchema>
