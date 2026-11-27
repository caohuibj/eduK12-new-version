import { Prisma } from '@prisma/client'
import {
  authorizeToolPublication, isToolLicensingEnabled, isExpandedToolLicensingEnabled, ToolLicenseAccessError,
} from '../tool-licensing/runtime'
import { toolLicenseKey } from '../tool-licensing/contracts'
import type { FrozenGovernedPackage, ResearchFrozenUnit } from './publication.service'
import { SurveyWaveError } from './waves.service'

type LicensedUnit = Pick<ResearchFrozenUnit, 'kind' | 'sourceProvenance'>
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
function fail(message: string): never { throw new SurveyWaveError(409, message) }
type Package = Pick<FrozenGovernedPackage, 'importId' | 'toolId' | 'hash' | 'family'>
type GovernedFamily = LicensedUnit['kind'] | Package['family']

/** Resolve only public source identities sealed by the existing freezer. A local
 * draft, private composition or title is never a commercial identity. Call only
 * inside first OPEN; the old standard flag never opts other source tiers in. */
export async function authorizeSurveyToolPublication(tx: Prisma.TransactionClient, input: {
  subjectId: string
  publicationId: string
  units: readonly LicensedUnit[]
  governedPackages?: readonly Package[]
}) {
  if (!isToolLicensingEnabled('SURVEY')) return
  const expanded = isExpandedToolLicensingEnabled('SURVEY')
  const keys = new Set<string>()
  const unresolved = new Set<string>()
  const governed = new Map<string, { family: GovernedFamily; hash?: string }>()
  const library = new Map<string, { releaseId: string; contentHash: string }>()
  const packages = new Map<string, Package>()
  const packageMembers = new Set<string>()
  const addGoverned = (id: string, family: GovernedFamily, hash?: string) => {
    const previous = governed.get(id)
    if (previous && (previous.family !== family || previous.hash && hash && previous.hash !== hash))
      fail('冻结治理工具来源不一致')
    governed.set(id, { family, hash: hash ?? previous?.hash })
  }
  if (expanded) for (const p of input.governedPackages ?? []) {
    if (!text(p.importId) || !text(p.toolId) || !text(p.hash)
      || !['COMBINATION', 'BUNDLE'].includes(p.family) || packages.has(p.importId))
      fail('冻结整包来源不完整')
    packages.set(p.importId, p)
    addGoverned(p.toolId, p.family, p.hash)
  }
  for (const unit of input.units) {
    if (!expanded && unit.kind !== 'SCALE') continue
    const p = unit.sourceProvenance
    if (!p) continue
    const source = record(p.source)
    if (expanded) {
      // A package license includes its fixed components; never charge them a
      // second time, even when they retain underlying standard/profile metadata.
      const member = record(p.surveyPackage)
      if (member) {
        const parent = text(member.importId) ? packages.get(member.importId) : undefined
        if (!parent || member.toolId !== parent.toolId || member.hash !== parent.hash)
          fail('冻结整包成员缺少一致的父组合')
        packageMembers.add(parent.importId)
        continue
      }
      const refId = typeof source?.sourceId === 'string' && source.sourceId.startsWith('survey-tool:')
        ? source.sourceId.slice('survey-tool:'.length) : undefined
      const taggedId = text(p.surveyToolReleaseId) ? p.surveyToolReleaseId : undefined
      if (refId || taggedId) {
        if ((source?.kind !== undefined && source.kind !== unit.kind) || (refId && taggedId && refId !== taggedId))
          fail('冻结治理工具来源不一致')
        addGoverned(taggedId ?? refId!, unit.kind, source && text(source.sourceVersion) ? source.sourceVersion : undefined)
        continue
      }
      const libraryId = typeof source?.sourceId === 'string' && source.sourceId.startsWith('library:')
        ? source.sourceId.slice('library:'.length) : undefined
      if (unit.kind === 'SCALE' && (libraryId || text(p.libraryEntryId))) {
        const release = record(p.sourceMeasurementRelease)
        if (!text(p.libraryEntryId) || source?.kind !== 'SCALE' || libraryId !== p.libraryEntryId
          || !release || !text(release.releaseId) || !text(release.contentHash))
          fail('冻结共享库量表来源不完整')
        const previous = library.get(p.libraryEntryId)
        if (previous && (previous.releaseId !== release.releaseId || previous.contentHash !== release.contentHash))
          fail('冻结共享库量表来源不一致')
        library.set(p.libraryEntryId, { releaseId: release.releaseId, contentHash: release.contentHash })
        continue
      }
      if (unit.kind === 'COGNITIVE' && typeof source?.sourceId === 'string'
        && source.sourceId.startsWith('cognitive-profile:')) {
        const profile = record(p.cognitiveProfile), configuration = record(profile?.configuration)
        if (!profile || !configuration || configuration.kind !== 'COGNITIVE_PROFILE' || !text(configuration.testType)
          || source.kind !== 'COGNITIVE' || source.sourceId !== `cognitive-profile:${configuration.configId}:${configuration.profile}`
          || !text(profile.artifactHash) || profile.artifactHash !== source.sourceVersion)
          fail('冻结认知配置来源不一致')
        // Match the currently issuable Survey profile tier in the directory.
        // Span profiles and legacy raw configs retain their compatibility path.
        if (['reaction', 'gonogo'].includes(configuration.testType)) keys.add('COGNITIVE:' + configuration.testType)
        continue
      }
    }
    if (unit.kind !== 'SCALE') continue
    const refId = source?.kind === 'SCALE' && typeof source.sourceId === 'string'
      && source.sourceId.startsWith('survey-standard:')
      ? source.sourceId.slice('survey-standard:'.length) : undefined
    const taggedId = text(p.surveyStandardReleaseId) ? p.surveyStandardReleaseId : undefined
    if (!refId && !taggedId) continue
    if (refId && taggedId && refId !== taggedId)
      throw new SurveyWaveError(409, '冻结标准量表来源不一致')
    if (text(p.code)) keys.add('SCALE:' + p.code)
    else unresolved.add(taggedId ?? refId!)
  }
  if (expanded && [...packages.keys()].some(id => !packageMembers.has(id))) fail('冻结整包缺少投放成员')
  if (governed.size) {
    const rows = await tx.$queryRaw<Array<{ id: string; family: GovernedFamily; tool_key: string; snapshot_hash: string }>>(Prisma.sql`
      SELECT id,family,tool_key,snapshot_hash FROM survey_governed_tools
      WHERE id IN (${Prisma.join([...governed.keys()].sort())})
    `)
    const found = new Map(rows.map(row => [row.id, row]))
    for (const [id, expected] of governed) {
      const row = found.get(id)
      if (!row || row.family !== expected.family || !text(row.tool_key)
        || expected.hash && expected.hash !== row.snapshot_hash) fail('冻结治理工具来源缺失或已变化')
      keys.add(toolLicenseKey(row.family, row.tool_key))
    }
  }
  if (library.size) {
    // Exactly the public library tier offered by the Survey license directory;
    // the frozen source release/hash must still describe this approved entry.
    const rows = await tx.$queryRaw<Array<{ id: string; release_id: string; content_key: string; content_hash: string }>>(Prisma.sql`
      SELECT entry.id,entry.release_id,m.content_key,m.content_hash
      FROM scale_library_entries entry
      JOIN scale_library_submissions submission ON submission.id=entry.submission_id
      JOIN measurement_content_releases m ON m.id=entry.release_id
      WHERE entry.id IN (${Prisma.join([...library.keys()].sort())})
        AND entry.status='ACTIVE' AND submission.status='APPROVED'
        AND m.family='SCALE' AND m.layer='MEASUREMENT' AND m.status='PUBLISHED'
        AND NOT EXISTS(SELECT 1 FROM scale_library_emergency_stops stop
          WHERE stop.target_kind='RELEASE' AND stop.target_id=m.id)
        AND EXISTS(SELECT 1 FROM survey_tool_policies policy WHERE policy.product='SURVEY'
          AND policy.resource_key='release:'||m.id AND policy.fingerprint=m.content_hash
          AND policy.decision='APPROVED' AND NOT policy.paused)
    `)
    const found = new Map(rows.map(row => [row.id, row]))
    for (const [id, expected] of library) {
      const row = found.get(id)
      if (!row || row.release_id !== expected.releaseId || row.content_hash !== expected.contentHash || !text(row.content_key))
        fail('冻结共享库量表未匹配已批准的精确发布版本')
      keys.add(toolLicenseKey('SCALE', row.content_key))
    }
  }
  if (unresolved.size) {
    // Older frozen standard snapshots may lack the stable code. Resolve all
    // exact sources together; ordinary private/legacy scales never reach here.
    const rows = await tx.$queryRaw<Array<{ id: string; tool_key: string }>>(Prisma.sql`
      SELECT id,tool_key FROM survey_standard_releases
      WHERE id IN (${Prisma.join([...unresolved].sort())})
    `)
    const found = new Map(rows.map(row => [row.id, row.tool_key]))
    for (const id of unresolved) {
      const code = found.get(id)
      if (!text(code)) throw new SurveyWaveError(409, '冻结标准量表来源缺失')
      keys.add('SCALE:' + code)
    }
  }
  if (!keys.size) return
  try {
    await authorizeToolPublication(tx, {
      product: 'SURVEY', subjectId: input.subjectId,
      publicationId: input.publicationId, toolKeys: [...keys].sort(),
    })
  } catch (error) {
    if (error instanceof ToolLicenseAccessError)
      throw new SurveyWaveError(error.statusCode, error.message)
    throw error
  }
}

// Compatibility for existing internal standard-only callers and evidence.
export const authorizeSurveyStandardPublication = authorizeSurveyToolPublication
