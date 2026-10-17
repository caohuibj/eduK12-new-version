import { z } from 'zod'

export const surveyAnalyticsItemRequestSchema=z.object({
  instrumentKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/),
  // Matrix answers use a frozen question key followed by a frozen row key.
  itemKey:z.string().regex(/^[a-z][a-z0-9_-]{0,79}(?::[a-z][a-z0-9_-]{0,79})?$/),
}).strict()
