import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'
import onlineExample from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { sjtNativeStagedTemplate } from '../fixtures/sjt-native-staged.fixture'
import { compileSjtAuthorDocument } from '../../modules/situational/authoring/dispatcher'
import { prepareRelease } from '../../modules/measurement-content/release'
import { sjtMeasurementRelease } from '../../modules/measurement-content/sjt'
import {
  assertSjtEntryDistributionAuthority, readSjtEntryDistributionSource,
  recheckSjtEntryDistributionAuthority, sjtEntryDistributionReceiptSchema,
} from '../../modules/situational/entry-authority'

vi.mock('../../config/database', () => ({ prisma: {} }))

const actorId = 'actor', releaseId = 'author-release', measurementId = 'e705a006-0310-4bac-96ef-cd748d99ddbc'
const now = new Date('2026-10-24T11:00:00.000Z')
const compiled = compileSjtAuthorDocument(onlineExample)
const prepared = prepareRelease(sjtMeasurementRelease({
  localId: compiled.package.key, version: compiled.package.instrumentVersion,
  instrumentVersion: compiled.package.instrumentVersion, definition: compiled.package.definition,
  onlineProtocol: compiled.package.online, scope: { kind: 'PLATFORM', ownerId: 'author' },
  provenance: { authorReleaseId: releaseId, adaptationSource: null },
}))
const sql = (query: any) => (query.strings ?? query).join('')
const grant = (id = 'grant') => ({
  id, subject_id: actorId, issuer_id: 'issuer', parent_grant_id: null,
  product: 'SURVEY', scope_kind: 'PLATFORM', scope_id: 'situational-library-governance',
  resource_kind: 'material', resource_keys: [measurementId], capabilities: ['material.distribute'],
  delegable_capabilities: [] as string[], remaining_delegation_depth: 0,
  valid_from: new Date(now.getTime() - 1000), expires_at: new Date(now.getTime() + 1000),
  ancestry: [id], version: 1, revoked_at: null as Date | null,
  subject_active: true, subject_frozen: false, subject_expires_at: null as Date | null,
})
let source: any, draft: any, measurement: any, candidates: Array<{ id: string }>
let chains: Map<string, any[]>, clock: Date, entryActive: boolean
const db = { $queryRaw: vi.fn(), sjtAuthorRelease: { findUnique: vi.fn() }, sjtAuthorDraft: { findUnique: vi.fn() } }
const tx = db as unknown as Prisma.TransactionClient
const input = () => ({ actorId, releaseId, instrumentVersion: source.instrumentVersion })
function replaceOriginalDocument(template: unknown) {
  const current = compileSjtAuthorDocument(template)
  source.instrumentKey = current.package.key; source.instrumentVersion = current.package.instrumentVersion
  source.contentDigest = current.contentDigest; source.definitionHash = current.definitionHash
  source.package = { ...current.package, releaseStatus: 'PUBLISHED' }
  draft.template = template; draft.contentDigest = current.contentDigest
  const projected = prepareRelease(sjtMeasurementRelease({ localId: current.package.key,
    version: current.package.instrumentVersion, instrumentVersion: current.package.instrumentVersion,
    definition: current.package.definition, onlineProtocol: current.package.online,
    scope: { kind: 'PLATFORM', ownerId: 'author' }, provenance: { authorReleaseId: releaseId, adaptationSource: null } }))
  Object.assign(measurement, { content_key: projected.key, version: projected.version,
    content_hash: projected.contentHash, content: projected.content, asset_refs: projected.assetRefs })
}

beforeEach(() => {
  vi.resetAllMocks()
  source = { id: releaseId, measurementReleaseId: measurementId, sourceDraftId: 'draft',
    instrumentKey: compiled.package.key, instrumentVersion: compiled.package.instrumentVersion,
    contentDigest: compiled.contentDigest, definitionHash: compiled.definitionHash,
    package: { ...compiled.package, releaseStatus: 'PUBLISHED' }, status: 'PUBLISHED',
    authorizationPolicy: 'COURSE_GRANT_V1', authorId: 'author' }
  draft = { id: 'draft', ownerId: 'author', status: 'PUBLISHED', contentDigest: compiled.contentDigest,
    authorizationPolicy: 'COURSE_GRANT_V1', adaptationSource: null, template: onlineExample }
  measurement = { id: measurementId, layer: prepared.layer, family: prepared.family,
    content_key: prepared.key, version: prepared.version, hash_scheme: prepared.hashScheme,
    content_hash: prepared.contentHash, content: prepared.content, provenance: prepared.provenance,
    scope: prepared.scope, asset_refs: prepared.assetRefs, source_release_id: prepared.sourceReleaseId,
    published_by: 'reviewer', published_at: now, status: 'PUBLISHED' }
  candidates = [{ id: 'grant' }]; chains = new Map([['grant', [grant()]]]); clock = now; entryActive = true
  db.sjtAuthorRelease.findUnique.mockImplementation(async () => source)
  db.sjtAuthorDraft.findUnique.mockImplementation(async () => draft)
  db.$queryRaw.mockImplementation(async (query: any) => {
    const text = sql(query)
    if (text.includes("provenance ->> 'authorReleaseId'")) return [{ authorReleaseId: measurement.provenance.authorReleaseId }]
    if (text.includes('FROM sjt_author_drafts')) return draft ? [{ id: draft.id }] : []
    if (text.includes('FROM sjt_author_releases')) return source ? [{ id: source.id }] : []
    if (text.includes('SELECT * FROM measurement_content_releases')) return [measurement]
    if (text.includes('FROM content_capability_grants leaf')) return chains.get(query.values[0]) ?? []
    if (text.includes('SELECT id FROM content_capability_grants')) return candidates
    if (text.includes('WITH locked AS MATERIALIZED')) return entryActive ? [{ id: actorId }] : []
    if (text.includes('SELECT clock_timestamp() AS now')) return [{ now: clock }]
    throw new Error('Unexpected query: ' + text)
  })
})

describe('exact independent SJT Survey entry authority', () => {
  it.each([null, 'COURSE_GRANT_V1'])('accepts a valid original source policy %s without mutating it', async policy => {
    source.authorizationPolicy = policy; draft.authorizationPolicy = policy
    const result = await assertSjtEntryDistributionAuthority(tx, input())
    expect(result).toEqual({ protocol: 'sjt-survey-distribution-v1', actorId, grantId: 'grant', grantVersion: 1,
      measurementReleaseId: measurementId, measurementContentHash: prepared.contentHash, releaseId,
      instrumentVersion: source.instrumentVersion, definitionHash: compiled.definitionHash, contentDigest: compiled.contentDigest })
    expect(source.authorizationPolicy).toBe(policy)
    expect(draft.authorizationPolicy).toBe(policy)
    expect(sjtEntryDistributionReceiptSchema.safeParse(result).success).toBe(true)
    const discovery = db.$queryRaw.mock.calls.map(call => sql(call[0])).find(text => text.includes('SELECT id FROM content_capability_grants'))!
    expect(discovery).toContain("product='SURVEY'")
    expect(discovery).toContain("scope_kind='PLATFORM'")
    expect(discovery).toContain("scope_id='situational-library-governance'")
    expect(discovery).toContain("resource_kind='material'")
    expect(discovery).toContain("'material.distribute'=ANY(capabilities)")
    expect(discovery).toContain('LIMIT 129')
  })
  it('retains source SHARE locks and reads current records after locks', async () => {
    await readSjtEntryDistributionSource(tx, measurementId)
    const queries = db.$queryRaw.mock.calls.map(call => sql(call[0]))
    const draftLock = queries.findIndex(text => text.includes('FROM sjt_author_drafts'))
    const authorLock = queries.findIndex(text => text.includes('FROM sjt_author_releases'))
    const measurementLock = queries.findIndex(text => text.includes('SELECT * FROM measurement_content_releases'))
    expect(draftLock).toBeLessThan(authorLock); expect(authorLock).toBeLessThan(measurementLock)
    for (const index of [draftLock, authorLock, measurementLock]) expect(queries[index]).toContain('FOR SHARE')
    expect(db.sjtAuthorRelease.findUnique.mock.invocationCallOrder[1]).toBeGreaterThan(db.$queryRaw.mock.invocationCallOrder[authorLock])
    expect(db.sjtAuthorDraft.findUnique.mock.invocationCallOrder[0]).toBeGreaterThan(db.$queryRaw.mock.invocationCallOrder[draftLock])
  })
  it('accepts the real staged upload compiler without flattening its source package', async () => {
    replaceOriginalDocument(sjtNativeStagedTemplate)
    const receipt = await assertSjtEntryDistributionAuthority(tx, input())
    expect(receipt.definitionHash).toBe(source.definitionHash)
    expect(receipt.contentDigest).toBe(source.contentDigest)
    expect(source.package.online).toBeUndefined()
    expect(source.package.definition.flow.nodes.some((node: any) => node.responseStages?.length)).toBe(true)
  })
  it.each([
    { licenseStatus: 'unknown' }, { redistribution: 'restricted' }, { redistribution: 'unknown' },
  ])('retains unknown/restricted license metadata without replacing exact entry authority %j', async defect => {
    replaceOriginalDocument({ ...onlineExample, display: { ...onlineExample.display, ...defect } })
    await expect(readSjtEntryDistributionSource(tx, measurementId)).resolves.toBeTruthy()
    await expect(assertSjtEntryDistributionAuthority(tx, input())).resolves.toBeTruthy()
    candidates=[]
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({statusCode:403})
  })
  it.each(['unknown', undefined])('rejects unknown or missing author policy %s', async policy => {
    source.authorizationPolicy = policy
    await expect(readSjtEntryDistributionSource(tx, measurementId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    ['status', 'DRAFT'], ['ownerId', 'other'], ['contentDigest', '0'.repeat(64)],
    ['adaptationSource', {}], ['adaptationSource', undefined], ['authorizationPolicy', null],
  ])('rejects source draft %s defect', async (field, value) => {
    draft[field as string] = value
    await expect(readSjtEntryDistributionSource(tx, measurementId)).rejects.toMatchObject({ code: 'SOURCE_SJT_ENTRY_SOURCE_INVALID', statusCode: 403 })
  })
  it('recompiles the current original document and rejects changed author content', async () => {
    draft.template = { ...onlineExample, title: 'changed' }
    await expect(readSjtEntryDistributionSource(tx, measurementId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    ['status', 'RETIRED'], ['measurementReleaseId', 'wrong'], ['instrumentVersion', '99.0.0'],
    ['definitionHash', '0'.repeat(64)], ['contentDigest', '0'.repeat(64)],
  ])('rejects author release %s mismatch', async (field, value) => {
    source[field] = value
    await expect(readSjtEntryDistributionSource(tx, measurementId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each([
    ['status', 'REVOKED'], ['content_hash', '0'.repeat(64)], ['version', 'other'],
    ['scope', { kind: 'PLATFORM', ownerId: 'other' }],
    ['provenance', { authorReleaseId: releaseId }],
    ['provenance', { authorReleaseId: releaseId, adaptationSource: {} }],
    ['provenance', { authorReleaseId: releaseId, adaptationSource: null, unrecognized: true }],
  ])('rejects canonical measurement identity/provenance defect %s', async (field, value) => {
    measurement[field as string] = value
    await expect(readSjtEntryDistributionSource(tx, measurementId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rejects tampered stored package instead of issuing a new snapshot', async () => {
    source.package = { ...source.package, releaseStatus: 'DRAFT' }
    await expect(readSjtEntryDistributionSource(tx, measurementId)).rejects.toMatchObject({ statusCode: 403 })
  })
  it('requires a separate current entry grant even when the source has a course policy', async () => {
    candidates = []
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({ code: 'SOURCE_SJT_ENTRY_AUTHORITY_REQUIRED', statusCode: 403 })
  })
  it('requires current Survey entry administration independently of a content grant', async () => {
    entryActive = false
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({ statusCode: 403 })
    expect(db.$queryRaw.mock.calls.some(call => sql(call[0]).includes('SELECT id FROM content_capability_grants'))).toBe(false)
  })
  it.each([
    { product: 'TRAINING' }, { scope_kind: 'COURSE' }, { scope_id: 'other' },
    { resource_keys: ['another-measurement'] }, { capabilities: ['material.adapt'] },
    { subject_id: 'another-actor' }, { revoked_at: now }, { expires_at: now }, { subject_frozen: true },
  ])('checks current exact capability and principal, not discovery hints: %j', async defect => {
    chains.set('grant', [{ ...grant(), ...defect }])
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({ statusCode: 403 })
  })
  it('locks and rejects a revoked ancestor even when the leaf remains active', async () => {
    const parent = { ...grant('parent'), subject_id: 'issuer', delegable_capabilities: ['material.distribute'], remaining_delegation_depth: 1, revoked_at: now }
    const child = { ...grant(), parent_grant_id: 'parent', ancestry: ['parent', 'grant'] }
    chains.set('grant', [child, parent])
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({ statusCode: 403 })
    expect(db.$queryRaw.mock.calls.some(call => sql(call[0]).includes('ORDER BY a.id FOR SHARE OF a, u'))).toBe(true)
  })
  it('may choose an alternative current grant only for unpinned discovery', async () => {
    candidates.push({ id: 'alternative' }); chains.set('grant', [{ ...grant(), revoked_at: now }])
    chains.set('alternative', [grant('alternative')])
    expect((await assertSjtEntryDistributionAuthority(tx, input())).grantId).toBe('alternative')
  })
  it.each([null, undefined, {}, { protocol: 'other' }])('fails closed for supplied malformed pinned receipt %j', async pinned => {
    await expect(assertSjtEntryDistributionAuthority(tx, { ...input(), pinned })).rejects.toMatchObject({ code: 'SOURCE_SJT_ENTRY_RECEIPT_INVALID' })
    expect(db.$queryRaw).not.toHaveBeenCalled()
  })
  it('never switches a revoked pinned grant to a valid alternative', async () => {
    const pinned = await assertSjtEntryDistributionAuthority(tx, input())
    db.$queryRaw.mockClear(); candidates.push({ id: 'alternative' }); chains.set('alternative', [grant('alternative')])
    chains.set('grant', [{ ...grant(), revoked_at: now }])
    await expect(assertSjtEntryDistributionAuthority(tx, { ...input(), pinned })).rejects.toMatchObject({ statusCode: 403 })
    expect(db.$queryRaw.mock.calls.some(call => sql(call[0]).includes('SELECT id FROM content_capability_grants'))).toBe(false)
  })
  it('requires the exact stored grant version and full source identity', async () => {
    const pinned = await assertSjtEntryDistributionAuthority(tx, input())
    chains.set('grant', [{ ...grant(), version: 2 }])
    await expect(assertSjtEntryDistributionAuthority(tx, { ...input(), pinned })).rejects.toMatchObject({ code: 'SOURCE_SJT_ENTRY_AUTHORITY_STALE' })
    for (const field of ['actorId', 'releaseId', 'measurementReleaseId', 'instrumentVersion', 'measurementContentHash', 'definitionHash', 'contentDigest']) {
      const value = field.endsWith('Hash') || field.endsWith('Digest') ? '0'.repeat(64) : 'different'
      await expect(assertSjtEntryDistributionAuthority(tx, { ...input(), pinned: { ...pinned, [field]: value } })).rejects.toMatchObject({ code: 'SOURCE_SJT_ENTRY_RECEIPT_INVALID' })
    }
  })
  it('bounds discovery rather than selecting an arbitrary truncated candidate set', async () => {
    candidates = Array.from({ length: 129 }, (_, index) => ({ id: 'grant-' + index }))
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({ code: 'SOURCE_SJT_ENTRY_GRANT_LIMIT' })
  })
  it('rechecks copied receipts at final DB time without rereading or recompiling source', async () => {
    const receipt = JSON.parse(JSON.stringify(await assertSjtEntryDistributionAuthority(tx, input())))
    db.sjtAuthorRelease.findUnique.mockClear(); db.sjtAuthorDraft.findUnique.mockClear(); db.$queryRaw.mockClear()
    await recheckSjtEntryDistributionAuthority(tx, receipt)
    expect(db.sjtAuthorRelease.findUnique).not.toHaveBeenCalled(); expect(db.sjtAuthorDraft.findUnique).not.toHaveBeenCalled()
    expect(db.$queryRaw.mock.calls.every(call => !sql(call[0]).includes('measurement_content_releases'))).toBe(true)
    clock = new Date(now.getTime() + 1000)
    await expect(recheckSjtEntryDistributionAuthority(tx, receipt)).rejects.toMatchObject({ statusCode: 403 })
  })
  it.each(['revoked', 'version', 'entry', 'subject-expired'])('rejects current final-fence authority change: %s', async change => {
    const receipt = await assertSjtEntryDistributionAuthority(tx, input())
    if (change === 'entry') entryActive = false
    else chains.set('grant', [{ ...grant(), ...(change === 'revoked' ? { revoked_at: now }
      : change === 'version' ? { version: 2 } : { subject_expires_at: now }) }])
    await expect(recheckSjtEntryDistributionAuthority(tx, { ...receipt })).rejects.toMatchObject({ statusCode: 403 })
  })
  it('samples grant expiry after a simulated source/ancestor lock wait, never from process time', async () => {
    const query = db.$queryRaw.getMockImplementation()!
    db.$queryRaw.mockImplementation(async (...args: any[]) => {
      const result = await query(...args)
      if (sql(args[0]).includes('FROM content_capability_grants leaf')) clock = new Date(now.getTime() + 1000)
      return result
    })
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({ statusCode: 403 })
  })
  it('rechecks entry qualification after waiting for content ancestry', async () => {
    const query = db.$queryRaw.getMockImplementation()!
    db.$queryRaw.mockImplementation(async (...args: any[]) => {
      const result = await query(...args)
      if (sql(args[0]).includes('FROM content_capability_grants leaf')) entryActive = false
      return result
    })
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toMatchObject({ statusCode: 403 })
  })
  it('propagates unknown database failures without misreporting or trying an alternative grant', async () => {
    const failure = new Error('synthetic database disconnect'), query = db.$queryRaw.getMockImplementation()!
    db.$queryRaw.mockImplementation(async (...args: any[]) => {
      if (sql(args[0]).includes('FROM content_capability_grants leaf')) throw failure
      return query(...args)
    })
    candidates.push({ id: 'alternative' }); chains.set('alternative', [grant('alternative')])
    await expect(assertSjtEntryDistributionAuthority(tx, input())).rejects.toBe(failure)
    expect(db.$queryRaw.mock.calls.filter(call => sql(call[0]).includes('FROM content_capability_grants leaf'))).toHaveLength(1)
  })
})
