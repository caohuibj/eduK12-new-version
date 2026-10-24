import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { AdminPermissionError, assertEntryAdmin } from '../admin-permissions/service'
import { canonicalHash } from '../assessment-runtime/canonical'
import { SjtDraftError } from '../assessment-core/sjt/definition'
import { SjtAnswerError } from '../assessment-core/sjt/runtime'
import { ContentAuthorityError, type ContentAuthorityScope } from '../measurement-content/content-authority'
import { assertContentAuthority } from '../measurement-content/content-authority.repository'
import { getContentRelease } from '../measurement-content/repository'
import { ContentReleaseError, prepareRelease } from '../measurement-content/release'
import { sjtMeasurementRelease } from '../measurement-content/sjt'
import { compileSjtAuthorDocument } from './authoring/dispatcher'
import { SjtTemplateError } from './authoring/template'
import { validateSituationPackage } from './situation-package'

const text = z.string().min(1).max(240).refine(value => value === value.trim())
const hash = z.string().regex(/^[a-f0-9]{64}$/)
const sourceProofSchema = z.object({
  releaseId: text, measurementReleaseId: text, measurementContentHash: hash,
  instrumentKey: text, instrumentVersion: text, definitionHash: hash, contentDigest: hash,
}).strict()
export type SjtEntryDistributionSource = z.infer<typeof sourceProofSchema>
export const sjtEntryDistributionReceiptSchema = z.object({
  protocol: z.literal('sjt-survey-distribution-v1'), actorId: text, grantId: text,
  grantVersion: z.number().int().positive(), measurementReleaseId: text, measurementContentHash: hash,
  releaseId: text, instrumentVersion: text, definitionHash: hash, contentDigest: hash,
}).strict()
export type SjtEntryDistributionReceipt = z.infer<typeof sjtEntryDistributionReceiptSchema>

export class SjtEntryAuthorityError extends Error {
  readonly statusCode = 403
  constructor(public readonly code = 'SOURCE_SJT_ENTRY_AUTHORITY_REQUIRED') {
    super(code)
    this.name = 'SjtEntryAuthorityError'
  }
}
function fail(code = 'SOURCE_SJT_ENTRY_AUTHORITY_REQUIRED'): never { throw new SjtEntryAuthorityError(code) }
function knownFailure(error: unknown): never {
  if (error instanceof ContentAuthorityError || error instanceof AdminPermissionError) fail()
  if (error instanceof ContentReleaseError) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
  throw error
}
const knownPolicy = (value: unknown) => value === null || value === 'COURSE_GRANT_V1'
const scopeFor = (measurementReleaseId: string): ContentAuthorityScope => ({
  product: 'SURVEY', scopeKind: 'PLATFORM', scopeId: 'situational-library-governance',
  resourceKind: 'material', resourceKeys: [measurementReleaseId],
})

/** Only exact, original uploaded releases are eligible. This is a source proof,
 * not permission to distribute. Every read is inside the caller's transaction;
 * SHARE locks retain source policy, package and lifecycle until the write ends.
 * Initial pointer reads order this helper's draft -> author -> measurement locks
 * only; callers may already hold author/User SHARE locks. All facts are reread
 * after locking. No row lock is upgraded. Published draft edits are prohibited,
 * publication inserts a new author row, and retirement updates only the author
 * row; none of those paths upgrades both existing source rows in reverse order. */
export async function readSjtEntryDistributionSource(
  tx: Prisma.TransactionClient, measurementReleaseId: string,
): Promise<SjtEntryDistributionSource> {
  try {
    if (!text.safeParse(measurementReleaseId).success) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    const pointers = await tx.$queryRaw<Array<{ authorReleaseId: unknown }>>(Prisma.sql`
      SELECT provenance ->> 'authorReleaseId' AS "authorReleaseId"
      FROM measurement_content_releases WHERE id=${measurementReleaseId}`)
    const pointer = pointers[0]?.authorReleaseId
    if (pointers.length !== 1 || !text.safeParse(pointer).success) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    const before = await tx.sjtAuthorRelease.findUnique({ where: { id: pointer as string } })
    if (!before || before.measurementReleaseId !== measurementReleaseId) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    const drafts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM sjt_author_drafts WHERE id=${before.sourceDraftId} FOR SHARE`)
    const authors = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM sjt_author_releases WHERE id=${before.id} FOR SHARE`)
    if (drafts.length !== 1 || authors.length !== 1) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    const release = await tx.sjtAuthorRelease.findUnique({ where: { id: before.id } })
    const draft = await tx.sjtAuthorDraft.findUnique({ where: { id: before.sourceDraftId } })
    const measurement = await getContentRelease(tx, measurementReleaseId, true)
    if (!release || !draft || !measurement || release.sourceDraftId !== before.sourceDraftId
      || release.id !== pointer || release.measurementReleaseId !== measurementReleaseId
      || release.status !== 'PUBLISHED' || !knownPolicy(release.authorizationPolicy)
      || draft.status !== 'PUBLISHED' || draft.ownerId !== release.authorId
      || draft.contentDigest !== release.contentDigest || draft.adaptationSource !== null
      || !knownPolicy(draft.authorizationPolicy) || draft.authorizationPolicy !== release.authorizationPolicy
      || measurement.releaseId !== measurementReleaseId || measurement.layer !== 'MEASUREMENT'
      || measurement.family !== 'SJT' || measurement.status !== 'PUBLISHED'
      || measurement.provenance.authorReleaseId !== release.id
      || measurement.provenance.adaptationSource !== null) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')

    // Compile the immutable author document, rather than trusting a stored digest
    // or interpreting a course-adapted upload as an independent original source.
    let compiled: ReturnType<typeof compileSjtAuthorDocument>
    try { compiled = compileSjtAuthorDocument(draft.template) }
    catch (error) {
      if (error instanceof SjtTemplateError || error instanceof SjtDraftError || error instanceof SjtAnswerError)
        fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
      throw error
    }
    const pkg = { ...compiled.package, releaseStatus: 'PUBLISHED' as const }
    const validation = validateSituationPackage(pkg)
    if (!validation.valid || compiled.contentDigest !== release.contentDigest
      || compiled.definitionHash !== release.definitionHash || validation.definitionHash !== release.definitionHash
      || pkg.key !== release.instrumentKey || pkg.instrumentVersion !== release.instrumentVersion
      || canonicalHash(pkg) !== canonicalHash(release.package)
      || !['verified', 'authorized', 'self_authored'].includes(pkg.definition.license.status)
      || pkg.definition.license.redistribution !== 'allowed') fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    const expected = prepareRelease(sjtMeasurementRelease({
      localId: pkg.key, version: pkg.instrumentVersion, instrumentVersion: pkg.instrumentVersion,
      definition: pkg.definition, onlineProtocol: pkg.online,
      scope: { kind: 'PLATFORM', ownerId: draft.ownerId },
      provenance: { authorReleaseId: release.id, adaptationSource: null },
    }))
    if (measurement.hashScheme !== expected.hashScheme || measurement.contentHash !== expected.contentHash
      || measurement.key !== expected.key || measurement.version !== expected.version
      || measurement.sourceReleaseId !== expected.sourceReleaseId
      || canonicalHash(measurement.content) !== canonicalHash(expected.content)
      || canonicalHash(measurement.assetRefs) !== canonicalHash(expected.assetRefs)
      || canonicalHash(measurement.scope) !== canonicalHash(expected.scope)
      || canonicalHash(measurement.provenance) !== canonicalHash(expected.provenance)) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    const proof = sourceProofSchema.safeParse({
      releaseId: release.id, measurementReleaseId, measurementContentHash: measurement.contentHash,
      instrumentKey: release.instrumentKey, instrumentVersion: release.instrumentVersion,
      definitionHash: release.definitionHash, contentDigest: release.contentDigest,
    })
    if (!proof.success) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    return proof.data
  } catch (error) { return knownFailure(error) }
}

function parseReceipt(value: unknown): SjtEntryDistributionReceipt {
  const parsed = sjtEntryDistributionReceiptSchema.safeParse(value)
  if (!parsed.success) fail('SOURCE_SJT_ENTRY_RECEIPT_INVALID')
  return parsed.data
}
function receiptMatchesSource(receipt: SjtEntryDistributionReceipt, source: SjtEntryDistributionSource, actorId: string) {
  return receipt.actorId === actorId && receipt.releaseId === source.releaseId
    && receipt.instrumentVersion === source.instrumentVersion && receipt.measurementReleaseId === source.measurementReleaseId
    && receipt.measurementContentHash === source.measurementContentHash && receipt.definitionHash === source.definitionHash
    && receipt.contentDigest === source.contentDigest
}

/** A Training course permission never grants Survey access. Omitted pinned means
 * discover a current explicit Survey grant; every supplied value, including null,
 * must be an exact receipt and can never select another grant on failure. */
export async function assertSjtEntryDistributionAuthority(tx: Prisma.TransactionClient, input: {
  actorId: string; releaseId: string; instrumentVersion: string; pinned?: unknown;
}): Promise<SjtEntryDistributionReceipt> {
  try {
    const pinned = Object.prototype.hasOwnProperty.call(input, 'pinned') ? parseReceipt(input.pinned) : null
    if (!text.safeParse(input.actorId).success || !text.safeParse(input.releaseId).success
      || !text.safeParse(input.instrumentVersion).success) fail()
    const release = await tx.sjtAuthorRelease.findUnique({ where: { id: input.releaseId } })
    if (!release?.measurementReleaseId) fail('SOURCE_SJT_ENTRY_SOURCE_INVALID')
    const source = await readSjtEntryDistributionSource(tx, release.measurementReleaseId)
    if (source.releaseId !== input.releaseId || source.instrumentVersion !== input.instrumentVersion
      || pinned && !receiptMatchesSource(pinned, source, input.actorId)) fail('SOURCE_SJT_ENTRY_RECEIPT_INVALID')
    await assertEntryAdmin(tx, input.actorId, 'SURVEY')
    const scope = scopeFor(source.measurementReleaseId)
    let selected: { grantId: string; version: number } | undefined
    if (pinned) {
      selected = await assertContentAuthority(tx, { actorId: input.actorId, grantId: pinned.grantId, capability: 'material.distribute', scope })
      if (selected.version !== pinned.grantVersion) fail('SOURCE_SJT_ENTRY_AUTHORITY_STALE')
    } else {
      // Discovery alone never authorizes: each candidate is checked through the
      // shared full-ancestry locking primitive and its post-lock database clock.
      const candidates = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id FROM content_capability_grants
        WHERE subject_id=${input.actorId} AND product='SURVEY' AND scope_kind='PLATFORM'
          AND scope_id='situational-library-governance' AND resource_kind='material'
          AND ${source.measurementReleaseId}=ANY(resource_keys) AND 'material.distribute'=ANY(capabilities)
          AND revoked_at IS NULL AND valid_from<=clock_timestamp() AND expires_at>clock_timestamp()
        ORDER BY id LIMIT 129`)
      if (candidates.length > 128) fail('SOURCE_SJT_ENTRY_GRANT_LIMIT')
      for (const candidate of candidates) {
        try {
          selected = await assertContentAuthority(tx, { actorId: input.actorId, grantId: candidate.id, capability: 'material.distribute', scope })
          break
        } catch (error) {
          if (!(error instanceof ContentAuthorityError)) throw error
        }
      }
      if (!selected) fail()
    }
    // Qualification may have expired while a content-ancestor lock was awaited.
    await assertEntryAdmin(tx, input.actorId, 'SURVEY')
    return parseReceipt({ protocol: 'sjt-survey-distribution-v1', actorId: input.actorId,
      grantId: selected.grantId, grantVersion: selected.version,
      measurementReleaseId: source.measurementReleaseId, measurementContentHash: source.measurementContentHash,
      releaseId: source.releaseId, instrumentVersion: source.instrumentVersion,
      definitionHash: source.definitionHash, contentDigest: source.contentDigest })
  } catch (error) { return knownFailure(error) }
}

/** Final clock fence, after a full current-source check in this SAME transaction
 * has retained source SHARE locks. Accepts serialized/copied receipts but never
 * falls back to a new grant. It does not compile the package a second time. */
export async function recheckSjtEntryDistributionAuthority(
  tx: Prisma.TransactionClient, value: unknown,
): Promise<void> {
  try {
    const receipt = parseReceipt(value)
    await assertEntryAdmin(tx, receipt.actorId, 'SURVEY')
    const current = await assertContentAuthority(tx, { actorId: receipt.actorId, grantId: receipt.grantId,
      capability: 'material.distribute', scope: scopeFor(receipt.measurementReleaseId) })
    if (current.version !== receipt.grantVersion) fail('SOURCE_SJT_ENTRY_AUTHORITY_STALE')
    await assertEntryAdmin(tx, receipt.actorId, 'SURVEY')
  } catch (error) { knownFailure(error) }
}
