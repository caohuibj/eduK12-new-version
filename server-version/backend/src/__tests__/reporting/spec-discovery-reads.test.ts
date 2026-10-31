import { beforeEach, expect, it, vi } from 'vitest'
import { reportingSpecHash } from '../../modules/reporting/spec'
import { listPublishedReportingSpecs } from '../../modules/reporting/discovery'
import type { ReportingGroupSpecV1 } from '../../modules/reporting/types'

const mocks = vi.hoisted(() => ({ query: vi.fn(), access: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: { $queryRaw: mocks.query } }))
vi.mock('../../modules/reporting/pr4Authorization', () => ({ assertOrganizationReportingWorkspaceAccess: mocks.access }))

const definition: ReportingGroupSpecV1 = {
  schemaVersion: 1, analysisKind: 'GROUP', engineKey: 'ORG_GROUP_V1', engineVersion: '1.0.0',
  privacyUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT', minimumCohortN: 3,
  minimumContributorN: 3, reportEvidenceCeiling: 'RESEARCH_READY',
  metricRules: [{ metricId: 'score', sourceMetricKey: 'score', acceptedResultQuality: ['interpretable'],
    acceptedMetricQuality: 'IGNORE_METRIC_QUALITY', aggregations: ['MEAN'], missingnessRule: 'EXCLUDE',
    minimumMetricN: 3, observationUnit: 'SUBJECT', selectionPolicy: 'UNIQUE_OR_REJECT' }],
}

beforeEach(() => { vi.clearAllMocks(); mocks.access.mockResolvedValue(undefined) })

it.each([1, 4])('returns the same published spec page with two reads for %i records', async (count) => {
  const rows = Array.from({ length: count }, (_, i) => ({
    id: `spec-${i}`, specKey: 'wellbeing', version: count - i, status: 'PUBLISHED',
    definition, specHash: reportingSpecHash(definition), createdByUserId: 'synthetic-author',
    createdAt: new Date('2026-10-01T00:00:00Z'), reviewedByUserId: 'synthetic-reviewer',
    reviewedAt: new Date('2026-10-02T00:00:00Z'), publishedAt: new Date('2026-10-03T00:00:00Z'),
  }))
  mocks.query.mockImplementation(async (query, ...values) => {
    const sql = query.sql ?? query.join('?')
    if (sql.includes('COUNT(*)')) return [{ count: 10 }]
    if (sql.includes('ORDER BY "spec_key"')) {
      expect(sql).toContain('"status" = \'PUBLISHED\'')
      expect(sql).toContain('"definition"->>\'analysisKind\'')
      expect(sql).toContain('ORDER BY "spec_key", "version" DESC, "id"')
      expect(query.values).toEqual(['GROUP', 4, 4])
      return sql.includes('"spec_hash"') ? rows : rows.map(({ id }) => ({ id }))
    }
    return rows.filter(row => row.id === values[0])
  })
  const result = await listPublishedReportingSpecs({
    principal: { userId: 'synthetic-manager', platformRole: 'STANDARD' }, organizationId: 'synthetic-org',
    analysisKind: 'GROUP', page: 2, pageSize: 4,
  })
  expect(result).toEqual({ list: rows.map(row => ({ specId: row.id, specKey: row.specKey, version: row.version,
    analysisKind: 'GROUP', engineKey: 'ORG_GROUP_V1', reportEvidenceCeiling: 'RESEARCH_READY', metricIds: ['score'],
    privacy: { minimumCohortN: 3, minimumContributorN: 3 }, publishedAt: '2026-10-03T00:00:00.000Z' })),
    total: 10, page: 2, pageSize: 4 })
  expect(mocks.access).toHaveBeenCalledTimes(2)
  console.info(JSON.stringify({ records: count, prismaReadCalls: mocks.query.mock.calls.length, output: result }))
  expect(mocks.query).toHaveBeenCalledTimes(2)
})
