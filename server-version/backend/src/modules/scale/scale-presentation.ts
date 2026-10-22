import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { canonicalHash } from '../assessment-runtime/canonical'
import { getContentRelease } from '../measurement-content/repository'
import { scaleMeasurementRelease } from '../measurement-content/scale'
import type { ScaleDefinitionV2 } from './scale-definition'

export const frozenScalePresentationSchema = z.object({
  releaseId: z.string().min(1),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
  presentationMode: z.enum(['ONE_BY_ONE', 'ALL_AT_ONCE']),
}).strict()
export type FrozenScalePresentation = z.infer<typeof frozenScalePresentationSchema>

/** Immutable wrapper identity, not current library-use permission. Published
 * tasks may materialize children after ordinary withdrawal. New-use callers
 * separately check current grants; emergency collection guards remain active. */
export async function freezeLibraryScalePresentation(db: Prisma.TransactionClient,
  scale: { measurementReleaseId: string | null; instrumentVersion: string }, definition: ScaleDefinitionV2,
): Promise<FrozenScalePresentation> {
  if (!scale.measurementReleaseId) throw new Error('Library Scale presentation release missing')
  const release = await getContentRelease(db, scale.measurementReleaseId, true)
  if (!release || release.family !== 'SCALE' || release.layer !== 'MEASUREMENT') throw new Error('Library Scale presentation release invalid')
  const executable = release.content.executable as Record<string, unknown>
  const mode = executable?.presentationMode ?? 'RUNNER_DEFAULT'
  if (!['ONE_BY_ONE', 'ALL_AT_ONCE', 'RUNNER_DEFAULT'].includes(String(mode))) throw new Error('Library Scale presentation mode invalid')
  const expected = scaleMeasurementRelease({ localId: 'frozen-presentation', version: release.version,
    instrumentVersion: scale.instrumentVersion, definition, instrumentClass: 'CUSTOM_DESCRIPTIVE', scope: release.scope,
    presentationMode: mode as 'ONE_BY_ONE' | 'ALL_AT_ONCE' | 'RUNNER_DEFAULT' })
  if (canonicalHash(expected.content) !== canonicalHash(release.content)) throw new Error('Library Scale presentation definition mismatch')
  return { releaseId: release.releaseId, contentHash: release.contentHash,
    presentationMode: mode === 'ALL_AT_ONCE' ? 'ALL_AT_ONCE' : 'ONE_BY_ONE' }
}
