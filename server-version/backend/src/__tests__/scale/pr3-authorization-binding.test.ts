import { describe, expect, it } from 'vitest'
import { scaleDeploymentPolicyV1Schema } from '../../modules/scale/policy/deployment'

const basePolicy = {
  schemaVersion: 1 as const,
  revision: 1,
  locale: 'zh-CN',
  territory: 'CN',
  deploymentModes: ['STANDALONE'] as const,
  commercialNature: 'NON_COMMERCIAL' as const,
  requiredRightsActions: ['electronicAdministration', 'scoring', 'display'] as const,
  runtimePolicyHash: 'a'.repeat(64),
  inFlightCompletion: 'FROZEN_DEADLINE' as const,
}

describe('PR3 authorization binding contract', () => {
  it('requires every managed deployment to bind at least one durable authorization', () => {
    expect(() => scaleDeploymentPolicyV1Schema.parse({
      ...basePolicy,
      authorizationRefs: [],
    })).toThrow()

    expect(scaleDeploymentPolicyV1Schema.parse({
      ...basePolicy,
      authorizationRefs: ['authorization-1'],
    }).authorizationRefs).toEqual(['authorization-1'])
  })
})
