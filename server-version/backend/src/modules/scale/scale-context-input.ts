import { z } from 'zod'
import { isValidYearMonth, sexAtBirthSchema, gradeLevelSchema } from '../assessment-context/context'

export const standaloneContextSchema = z.object({
  birthYearMonth: z.string().refine(isValidYearMonth, '出生年月必须是 YYYY-MM').optional(),
  sexAtBirth: sexAtBirthSchema.optional(),
  gradeLevel: gradeLevelSchema.optional(),
  primaryLanguage: z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/).optional(),
  countryOrRegion: z.string().regex(/^[A-Z]{2}$/).optional(),
}).strict().optional()
