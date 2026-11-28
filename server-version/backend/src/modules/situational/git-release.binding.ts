import { z } from 'zod'
import { exactRelease } from '../measurement-content/release'
import { effectiveDisclosurePolicySchema } from '../scale/policy/schema'

const digest = z.string().regex(/^[a-f0-9]{64}$/)
export const sjtGitFrozenBindingSchema = z.object({
  axes: z.object({ content: digest, parameters: digest, report: digest }).strict(),
  effectiveDisclosure: effectiveDisclosurePolicySchema,
  reportRelease: exactRelease,
}).strict()
