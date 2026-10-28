import { z } from 'zod'
import { canonicalHash } from '../assessment-runtime/canonical'

const hash = z.string().regex(/^[a-f0-9]{64}$/)
export const nativeCompletionSchema = z.object({
  schemaVersion: z.literal(1),
  contextKey: z.string().min(1).max(512),
  configHash: hash,
  protocolSignature: hash,
  manifestHash: hash,
  formalCount: z.number().int().min(1).max(400),
  practiceCount: z.number().int().min(0).max(100),
  termination: z.enum(['completed', 'aborted']),
  terminationReason: z.string().min(1).max(256).nullable(),
  finalPayloadDigest: hash,
}).strict()
export type NativeCompletion = z.infer<typeof nativeCompletionSchema>

export function completionFromNativeClaim(value: unknown): NativeCompletion {
  const c = value as Record<string, unknown>
  return nativeCompletionSchema.parse({
    schemaVersion: 1, contextKey: c.contextKey, configHash: c.configHash,
    protocolSignature: c.protocolSignature, manifestHash: c.manifestHash,
    formalCount: c.formalCount ?? c.formalCaptureCount, practiceCount: c.practiceCount,
    termination: c.termination, terminationReason: c.terminationReason,
    finalPayloadDigest: c.finalPayloadDigest,
  })
}

/** Old submissions without this field retain their original canonical payload and report. */
export function validateNativeCompletion(value: unknown, authority: {
  sessionId: string; attemptEpoch: number; configHash: string; protocolSignature: string
  trialCount: number; maxTrials: number; expectedManifestHash: string | null
}): NativeCompletion {
  const c = nativeCompletionSchema.parse(value)
  if (!authority.expectedManifestHash
    || c.contextKey !== JSON.stringify([authority.sessionId, authority.attemptEpoch, authority.configHash])
    || c.configHash !== authority.configHash || c.protocolSignature !== authority.protocolSignature
    || c.manifestHash !== authority.expectedManifestHash || c.formalCount !== authority.trialCount
    || (c.termination === 'completed' && (c.terminationReason !== null || c.formalCount !== authority.maxTrials))) {
    throw new Error('Native completion does not match the frozen submitted records')
  }
  return c
}

export function assertArchivedNativeCompletion(claim: unknown, completion: NativeCompletion | undefined): void {
  if (completion && canonicalHash(completionFromNativeClaim(claim)) !== canonicalHash(completion)) {
    throw new Error('Archived native completion differs from the committed claim')
  }
}
