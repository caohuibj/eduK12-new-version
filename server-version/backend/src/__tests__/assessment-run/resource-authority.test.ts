import { describe, expect, it } from 'vitest'
import {
  RunResourceAuthorityRegistry,
  assertRunTrackNarrowing,
  createRelationalRunResourceAdapter,
  productionRunResourceAuthorityRegistry,
  type RunResourceAuthorityAdapter,
} from '../../modules/assessment-run/resourceAuthority'
import { createRelationalProductRegistry } from '../../modules/assessment-relational/product-registry'

const applicability = (overrides: Record<string, unknown> = {}) => ({
  schemaVersion: 1 as const,
  resourceKind: 'BUNDLE' as const,
  resourceKey: 'demo-bundle',
  resourceVersion: '1.0.0',
  subjectRoles: ['STUDENT'] as const,
  respondentRoles: ['STUDENT', 'TEACHER'] as const,
  relationshipKinds: ['SELF', 'COURSE_TEACHER_STUDENT'] as const,
  perspectives: ['SELF_REPORT', 'OBSERVER_REPORT'] as const,
  analysisMode: 'COHORT_AGGREGATE' as const,
  visibilityPolicyKey: 'DEMO_VISIBILITY_V1',
  minimumRespondents: 5,
  ...overrides,
})

const cohortPolicy = {
  schemaVersion: 1 as const,
  policyKey: 'DEMO_COHORT_V1',
  policyVersion: '1.0.0',
  minimumRespondents: 5,
  metricKeys: ['demoMetric'],
}

const publishedRegistry = createRelationalProductRegistry([{
  title: 'Demo',
  description: null,
  releaseStatus: 'PUBLISHED',
  scienceMaturity: 'PILOT',
  applicability: applicability(),
  cohortAnalysisPolicy: cohortPolicy,
  launchTarget: { runtime: 'COMPOSITE', compositeAssessmentId: 'composite-demo-v1' },
}])

describe('Run owning-resource authority adapters', () => {
  it('resolves only the exact published version and preserves owning policy', async () => {
    const registry = new RunResourceAuthorityRegistry([
      createRelationalRunResourceAdapter({ family: 'BUNDLE', registry: publishedRegistry }),
    ])
    const resolved = await registry.resolveExact({ family: 'BUNDLE', key: 'demo-bundle', version: '1.0.0' })
    expect(resolved).toMatchObject({
      family: 'BUNDLE',
      key: 'demo-bundle',
      version: '1.0.0',
      scientificMaturity: 'PILOT',
      minimumRespondents: 5,
      visibilityPolicyKey: 'DEMO_VISIBILITY_V1',
      runtimeLaunchTarget: { kind: 'COMPOSITE', ref: 'composite-demo-v1' },
    })
    await expect(registry.resolveExact({ family: 'BUNDLE', key: 'demo-bundle', version: '1.0.1' }))
      .rejects.toMatchObject({ code: 'RUN_RESOURCE_NOT_FOUND', statusCode: 404 })
  })

  it('rejects unpublished exact resources instead of falling back to latest', async () => {
    const draftRegistry = createRelationalProductRegistry([{
      title: 'Draft',
      description: null,
      releaseStatus: 'DRAFT',
      scienceMaturity: 'PILOT',
      applicability: applicability({ resourceVersion: '2.0.0' }),
      cohortAnalysisPolicy: cohortPolicy,
      launchTarget: null,
    }])
    const registry = new RunResourceAuthorityRegistry([
      createRelationalRunResourceAdapter({ family: 'BUNDLE', registry: draftRegistry }),
    ])
    await expect(registry.resolveExact({ family: 'BUNDLE', key: 'demo-bundle', version: '2.0.0' }))
      .rejects.toMatchObject({ code: 'RUN_RESOURCE_NOT_PUBLISHED' })
  })

  it('allows narrowing but rejects role, visibility and privacy widening', async () => {
    const registry = new RunResourceAuthorityRegistry([
      createRelationalRunResourceAdapter({ family: 'BUNDLE', registry: publishedRegistry }),
    ])
    const policy = await registry.resolveExact({ family: 'BUNDLE', key: 'demo-bundle', version: '1.0.0' })
    expect(() => assertRunTrackNarrowing(policy, {
      subjectRoles: ['STUDENT'],
      respondentRoles: ['TEACHER'],
      relationshipKinds: ['COURSE_TEACHER_STUDENT'],
      perspectives: ['OBSERVER_REPORT'],
      analysisMode: 'COHORT_AGGREGATE',
      visibilityPolicyKey: 'DEMO_VISIBILITY_V1',
      minimumRespondents: 8,
    })).not.toThrow()

    expect(() => assertRunTrackNarrowing(policy, {
      subjectRoles: ['STUDENT'],
      respondentRoles: ['PARENT'],
      relationshipKinds: ['COURSE_TEACHER_STUDENT'],
      perspectives: ['OBSERVER_REPORT'],
      analysisMode: 'COHORT_AGGREGATE',
      visibilityPolicyKey: 'DEMO_VISIBILITY_V1',
      minimumRespondents: 8,
    })).toThrow(/respondentRoles/)

    expect(() => assertRunTrackNarrowing(policy, {
      subjectRoles: ['STUDENT'],
      respondentRoles: ['TEACHER'],
      relationshipKinds: ['COURSE_TEACHER_STUDENT'],
      perspectives: ['OBSERVER_REPORT'],
      analysisMode: 'COHORT_AGGREGATE',
      visibilityPolicyKey: 'WEAKER_POLICY',
      minimumRespondents: 8,
    })).toThrow(/visibility/)

    expect(() => assertRunTrackNarrowing(policy, {
      subjectRoles: ['STUDENT'],
      respondentRoles: ['TEACHER'],
      relationshipKinds: ['COURSE_TEACHER_STUDENT'],
      perspectives: ['OBSERVER_REPORT'],
      analysisMode: 'COHORT_AGGREGATE',
      visibilityPolicyKey: 'DEMO_VISIBILITY_V1',
      minimumRespondents: 3,
    })).toThrow(/minimumRespondents/)
  })

  it('cannot enable an external adapter without stable operationKey lookup', () => {
    const unsafe: RunResourceAuthorityAdapter = {
      family: 'COGNITIVE',
      capabilities: {
        transactionMode: 'EXTERNAL',
        startMode: 'OPERATION_KEY',
        supportsLookupByOperationKey: false,
        supportsSafeCancel: false,
        finalAuthority: 'CANONICAL_RUNTIME',
        runtimeBindingKind: 'COGNITIVE',
        runV1Enabled: true,
      },
      async resolveExact() { throw new Error('unused') },
    }
    expect(() => new RunResourceAuthorityRegistry([unsafe])).toThrow(/operationKey/)
  })

  it('keeps production Run START fail-closed until C12 proves a safe runtime adapter', () => {
    for (const row of productionRunResourceAuthorityRegistry.capabilityMatrix()) {
      expect(row.capabilities.runV1Enabled).toBe(false)
      expect(row.capabilities.finalAuthority).toBe('CANONICAL_RUNTIME')
    }
    expect(() => productionRunResourceAuthorityRegistry.assertStartSupported('BUNDLE'))
      .toThrow(/not enabled/)
    expect(() => productionRunResourceAuthorityRegistry.adapterFor('COGNITIVE'))
      .toThrow(/unsupported/)
  })
})
