import { describe, expect, it } from 'vitest'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import {
  evaluateScaleDeployment,
  hashScaleDeploymentPolicy,
  type ScaleDeploymentModeV1,
  type ScaleDeploymentPolicyV1,
} from '../../modules/scale/policy/deployment'
import type { InstrumentAuthorizationRecordV1 } from '../../modules/assessment-authorization/types'

const runtimePolicyHash = canonicalHash({ policy: 'fixture' })
const policy = (overrides: Partial<ScaleDeploymentPolicyV1> = {}): ScaleDeploymentPolicyV1 => ({
  schemaVersion: 1,
  revision: 1,
  locale: 'zh-CN',
  territory: 'CN',
  deploymentModes: ['STANDALONE', 'QUESTIONNAIRE', 'PUBLIC_QUESTIONNAIRE', 'COMPOSITE'],
  commercialNature: 'NON_COMMERCIAL',
  requiredRightsActions: ['electronicAdministration', 'scoring', 'display'],
  authorizationRefs: ['auth-1'],
  runtimePolicyHash,
  inFlightCompletion: 'FROZEN_DEADLINE',
  ...overrides,
})

const authorization = (overrides: Partial<InstrumentAuthorizationRecordV1> = {}): InstrumentAuthorizationRecordV1 => ({
  schemaVersion: 1,
  authorizationId: 'auth-1',
  version: 2,
  instrumentKey: 'fixture_scale',
  instrumentVersion: '1.0.0',
  grantor: 'grantor',
  grantee: 'huisurvey',
  scope: {
    electronicAdministration: true,
    scoring: true,
    translation: false,
    display: true,
    territories: ['CN'],
    locales: ['zh-CN'],
    commercialNature: 'NON_COMMERCIAL',
  },
  validFrom: '2026-01-01T00:00:00.000Z',
  validTo: '2027-01-01T00:00:00.000Z',
  basis: 'fixture',
  status: 'APPROVED',
  evidenceAssetId: null,
  evidenceSha256: null,
  selfApprovalDeclaration: null,
  approvedByUserId: 'admin-1',
  approvedAt: '2026-01-01T00:00:00.000Z',
  createdByUserId: 'admin-1',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const evaluate = (input: {
  deployment?: ScaleDeploymentPolicyV1
  requestedMode?: ScaleDeploymentModeV1
  authorizations?: InstrumentAuthorizationRecordV1[]
}) => evaluateScaleDeployment({
  policy: input.deployment ?? policy(),
  requestedMode: input.requestedMode ?? 'STANDALONE',
  instrumentKey: 'fixture_scale',
  instrumentVersion: '1.0.0',
  compiledRuntimePolicyHash: runtimePolicyHash,
  authorizations: input.authorizations ?? [authorization()],
  nowIso: '2026-09-21T00:00:00.000Z',
})

describe('Scale deployment policy', () => {
  it('is deterministic and allows every explicitly bound surface', () => {
    expect(hashScaleDeploymentPolicy(policy())).toBe(hashScaleDeploymentPolicy(policy()))
    for (const requestedMode of ['STANDALONE', 'QUESTIONNAIRE', 'PUBLIC_QUESTIONNAIRE', 'COMPOSITE'] as const) {
      expect(evaluate({ requestedMode })).toMatchObject({ allowNewStarts: true, reasons: [] })
    }
  })

  it('fails closed for an unbound surface', () => {
    expect(evaluate({
      requestedMode: 'COMPOSITE',
      deployment: policy({ deploymentModes: ['STANDALONE'] }),
    }).reasons).toContain('DEPLOYMENT_MODE_NOT_BOUND')
  })

  it('fails closed for missing, expired, revoked and stale authorization bindings', () => {
    expect(evaluate({ authorizations: [] }).reasons).toContain('AUTHORIZATION_MISSING')
    expect(evaluate({ authorizations: [authorization({ validTo: '2026-01-02T00:00:00.000Z' })] }).allowNewStarts).toBe(false)
    expect(evaluate({ authorizations: [authorization({ status: 'REVOKED' })] }).allowNewStarts).toBe(false)
    expect(evaluate({ deployment: policy({ authorizationRefs: ['different-auth'] }) }).reasons).toContain('AUTHORIZATION_BINDING_STALE')
  })

  it('rejects rights, scope, commercial and runtime-policy widening', () => {
    expect(evaluate({ deployment: policy({ territory: 'US' }) }).reasons).toContain('AUTHORIZATION_SCOPE_MISMATCH')
    expect(evaluate({ deployment: policy({ commercialNature: 'COMMERCIAL' }) }).reasons).toContain('COMMERCIAL_NATURE_MISMATCH')
    expect(evaluate({ deployment: policy({ requiredRightsActions: ['translation'] }) }).reasons).toContain('RIGHT_translation_MISSING')
    expect(evaluate({ deployment: policy({ runtimePolicyHash: 'a'.repeat(64) }) }).reasons).toContain('RUNTIME_POLICY_HASH_MISMATCH')
  })

  it('ignores a newer DRAFT row while a valid approved lineage remains effective', () => {
    const older = authorization({ version: 1, status: 'APPROVED' })
    const newer = authorization({ version: 2, status: 'DRAFT' })
    expect(evaluate({ authorizations: [older, newer] })).toMatchObject({ allowNewStarts: true, reasons: [] })
  })
})
