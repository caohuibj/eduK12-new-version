import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({ rows: vi.fn(), context: vi.fn(), entry: vi.fn(), spec: vi.fn(),
  read: vi.fn(), persist: vi.fn(), freeze: vi.fn(), resolve: vi.fn(), build: vi.fn(), privacy: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: m.rows } }))
vi.mock('../../modules/organization/access', () => ({ resolveOrganizationAccessContext: m.context }))
vi.mock('../../modules/assessment-run/registeredResources', () => ({ resolveHistoricalRelationalEntry: m.entry }))
vi.mock('../../modules/reporting/spec', () => ({ getPublishedReportingSpec: m.spec }))
vi.mock('../../modules/reporting/authorization', () => ({
  assertOrganizationGroupArtifactReadAccess: vi.fn(), assertOrganizationGroupReportGenerateAccess: vi.fn(),
  hideUnauthorizedArtifact: (fn: () => Promise<unknown>) => fn(),
}))
vi.mock('../../modules/reporting/artifact', () => ({ readReportingArtifactRecord: m.read, createOrReuseReportingArtifact: m.persist }))
vi.mock('../../modules/reporting/cohort', () => ({ freezeRunTrackCohort: m.freeze }))
vi.mock('../../modules/reporting/resultSource', () => ({ resolveAuthoritativeRunResults: m.resolve }))
vi.mock('../../modules/reporting/engine', () => ({ buildReportingArtifact: m.build }))
vi.mock('../../modules/reporting/fixedPopulationPrivacy', () => ({ assertFixedPopulationArtifactDisclosure: m.privacy }))
vi.mock('../../modules/reporting/subgroupPrivacy', () => ({ assertReportingSubgroupsPrivacy: vi.fn() }))

import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { generateOrganizationGroupAnalysis, readOrganizationGroupArtifact } from '../../modules/reporting/service'

const base = { principal: { userId: 'owner', platformRole: 'STANDARD' as const }, organizationId: 'org', runId: 'run', trackId: 'track', specId: 'spec' }
const artifact = { id: 'artifact', organizationId: 'org', specId: 'spec', analysisKind: 'GROUP', policyDomain: 'ORG_GROUP_REPORT_V1',
  generatedAt: new Date('2026-01-01'), artifactPayload: { schemaVersion: 1, source: { runId: 'run', trackId: 'track' },
    projection: { state: 'present', metrics: { visible: { state: 'present', value: 1 }, private: { state: 'present', value: 2 } } } } }
const delivery = [
  ['generation', () => generateOrganizationGroupAnalysis(base)],
  ['stored group read', () => readOrganizationGroupArtifact({ ...base, artifactId: artifact.id })],
] as const

function source(mode = 'AGGREGATE_ONLY', domain = 'LEGACY') {
  const disclosure = { schemaVersion: 1, policyKey: 'synthetic', minimumRespondents: 3,
    audiences: Object.fromEntries(['RESPONDENT', 'SUBJECT', 'TEACHER', 'PARENT', 'PROFESSIONAL', 'ORGANIZATION', 'RESEARCH']
      .map(audience => [audience, { mode, metricKeys: mode === 'NONE' ? [] : ['public-score'], longitudinalMetricKeys: [],
        ...(mode === 'DELAYED_AGGREGATE' ? { delaySeconds: 3600 } : {}) }])) }
  const policy = { analysisMode: 'INDIVIDUAL_ONLY', resultDisclosure: disclosure }
  m.rows.mockResolvedValue([{ family: 'SCALE', key: 'source', version: '1', policy, hash: canonicalHash(policy), closedAt: null, productDomain: domain }])
  m.entry.mockResolvedValue({ releaseStatus: 'PUBLISHED', resultDisclosure: disclosure })
}

beforeEach(() => {
  vi.clearAllMocks()
  m.context.mockResolvedValue({ membershipId: 'member', organizationStatus: 'ACTIVE', orgRole: 'ORG_ADMIN', productDomain: 'LEGACY', personas: [], capabilities: [], explicitDenies: [] })
  m.spec.mockResolvedValue({ id: 'spec', definition: { metricRules: [{ metricId: 'visible', sourceMetricKey: 'public-score' }, { metricId: 'private', sourceMetricKey: 'private-score' }] } })
  m.read.mockResolvedValue(artifact); m.persist.mockResolvedValue(artifact)
  m.freeze.mockResolvedValue({ id: 'cohort' }); m.resolve.mockResolvedValue({})
  m.build.mockReturnValue({ payload: artifact.artifactPayload, analysisIdentityHash: 'identity', snapshotHash: 'snapshot' })
  source()
})

describe.each(delivery)('%s uses the frozen source disclosure on schema1 reports', (_name, deliver) => {
  it('withholds an existing projection when the current audience has no aggregate disclosure', async () => {
    source('NONE')
    await expect(deliver()).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND', statusCode: 404 })
    expect(m.privacy).toHaveBeenCalled()
  })
  it('narrows declared metrics without mutating the stored projection or rejecting legitimate group access', async () => {
    const result = await deliver()
    expect(result.projection.metrics).toEqual({ visible: { state: 'present', value: 1 } })
    expect(artifact.artifactPayload.projection.metrics).toHaveProperty('private')
  })
  it('rejects a delayed source until its Run closes', async () => {
    source('DELAYED_AGGREGATE')
    await expect(deliver()).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
  })
  it('preserves declared-policy integrity checks', async () => {
    m.rows.mockResolvedValue([{ family: 'SCALE', key: 'source', version: '1', policy: { resultDisclosure: {} }, hash: 'mismatch', productDomain: 'LEGACY' }])
    await expect(deliver()).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
  })
  it.each(['LEGACY', 'SCHOOL'])('keeps the existing %s rule for a missing disclosure contract', async domain => {
    m.rows.mockResolvedValue([{ policy: {}, productDomain: domain }])
    if (domain === 'SCHOOL') await expect(deliver()).rejects.toMatchObject({ code: 'REPORT_NOT_FOUND' })
    else expect((await deliver()).projection).toEqual(artifact.artifactPayload.projection)
  })
})
