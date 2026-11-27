import { z } from 'zod'
import type { CognitiveResultSnapshot } from './types'
import { effectiveDisclosurePolicySchema } from '../../scale/policy/schema'
import { resolveAudienceDisclosure } from '../../scale/policy/disclosure'

const qualityStateSchema = z.enum(['interpretable', 'limited', 'invalid'])

export const cognitiveResultSnapshotSchema = z.object({
  schemaVersion: z.literal(1),
  completedAt: z.string().datetime({ offset: true }),
  testType: z.string().min(1),
  configVersion: z.string().min(1),
  engineVersion: z.string().min(1),
  scoringVersion: z.string().min(1),
  protocolSignature: z.string().regex(/^[0-9a-f]{64}$/),
  profile: z.enum(['experience', 'standard', 'research']).nullable(),
  metrics: z.record(z.string(), z.unknown()),
  quality: z.object({
    state: qualityStateSchema,
    flags: z.record(z.string(), z.boolean()),
    reasons: z.array(z.string()),
  }).strict(),
  references: z.array(z.record(z.string(), z.unknown())),
  report: z.record(z.string(), z.unknown()),
  effectiveDisclosure: effectiveDisclosurePolicySchema.optional(),
  assessmentContext: z.object({
    schemaVersion: z.literal(1),
    snapshotHash: z.string().min(1),
  }).strict().nullable(),
}).strict()

export const parseCognitiveResultSnapshot = (value: unknown): CognitiveResultSnapshot => (
  cognitiveResultSnapshotSchema.parse(value) as CognitiveResultSnapshot
)

/** Invalid results never expose normative/reference material at a read boundary. */
export const referencesForCognitiveResult = (
  snapshot: CognitiveResultSnapshot,
): CognitiveResultSnapshot['references'] => snapshot.quality.state === 'invalid' ? [] : snapshot.references


/** Keep authoritative metrics in the immutable result for governed consumers.
 * The participant projection may only return metrics already visible in the
 * frozen report, and never resolves a live configuration. */
export function cognitiveParticipantResult(snapshot:CognitiveResultSnapshot) {
  const policy=snapshot.effectiveDisclosure?resolveAudienceDisclosure(snapshot.effectiveDisclosure,'respondent'):undefined
  const allowed=new Set<string>()
  if(policy?.numericScores){
    for(const layer of ['headline','user','detail']){
      const items=snapshot.report[layer]
      if(!Array.isArray(items))continue
      for(const item of items)if(item&&typeof item.key==='string')allowed.add(item.key)
    }
  }
  const metrics=policy?Object.fromEntries(Object.entries(snapshot.metrics).filter(([key])=>allowed.has(key))):snapshot.metrics
  const quality=policy&&!policy.resultQualityDetails?{state:snapshot.quality.state,flags:{},reasons:[]}:snapshot.quality
  return {metrics,quality,qualityFlags:quality.flags,
    references:policy&&(!policy.numericScores||!policy.references||!policy.scoreDerivedLabels)?[]:referencesForCognitiveResult(snapshot),
    report:snapshot.report,assessmentContext:snapshot.assessmentContext}
}
