import { describe, expect, it, vi } from 'vitest'
import { getScaleInstrumentSource, getScaleInstrumentRuntimePolicy } from '../../modules/scale/onboarding/instrument-registry'
import { selfAuthoredSourceProof, registeredSelfAuthoredSourceProof, registeredSelfAuthoredDeploymentTerritory } from '../../modules/scale/onboarding/self-authored'
import { evaluateScaleDeployment, scaleDeploymentPolicyV1Schema, type ScaleDeploymentPolicyV1 } from '../../modules/scale/policy/deployment'
import { evaluateDurableInstrumentRights } from '../../modules/scale/deployment/rights'
import { previewScaleInstrument } from '../../modules/scale/onboarding/preview'
import { allowsScaleAxisRevision } from '../../modules/scale/onboarding/axis-snapshots'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'

import * as registry from '../../modules/scale/onboarding/instrument-registry'
import { buildScaleLibraryReadModel } from '../../modules/scale/library/scale-library-read-model'
import { standardCatalogRecord } from '../../modules/scale-library-governance/unified-catalog-model'

const key = 'academic_self_concept_chinese_zh_cn', version = '1.0.0'
const source = getScaleInstrumentSource(key, version)!
const runtime = getScaleInstrumentRuntimePolicy(key, version)!
const policy = (): ScaleDeploymentPolicyV1 => ({ schemaVersion: 1, revision: 1, locale: 'zh-CN', territory: 'ZZ',
  deploymentModes: ['STANDALONE', 'QUESTIONNAIRE'], commercialNature: 'UNSPECIFIED',
  requiredRightsActions: ['electronicAdministration', 'scoring', 'display'], authorizationRefs: [],
  selfAuthoredSourceHash: registeredSelfAuthoredSourceProof(key, version)!, runtimePolicyHash: runtime.runtimePolicyHash,
  localizationVersion: '1.0.0', inFlightCompletion: 'FROZEN_DEADLINE' })
const evaluate = (p = policy(), instrumentKey = key) => evaluateScaleDeployment({ policy: p, requestedMode: 'STANDALONE',
  instrumentKey, instrumentVersion: version, compiledRuntimePolicyHash: runtime.runtimePolicyHash, authorizations: [], usageRequirements: runtime.usageRequirements })

describe('registered self-authored source boundary', () => {
  it('permits real repository authorship without inventing a license, territory or commercial restriction', () => {
    expect(source.authorship?.confirmedOn).toBe('2026-10-25')
    expect(evaluate()).toMatchObject({ allowNewStarts: true, authorization: null, reasons: [] })
    expect(evaluate({ ...policy(), territory: 'US', commercialNature: 'COMMERCIAL' }).allowNewStarts).toBe(true)
    expect(evaluateDurableInstrumentRights({ instrumentKey: key, instrumentVersion: version, authorizations: [], locale: 'zh-CN', territory: 'ZZ' }).ok).toBe(true)
  })
  it('treats historic authored proofs as metadata, not a copyright permission gate', () => {
    expect(evaluate({ ...policy(), selfAuthoredSourceHash: '0'.repeat(64) }).allowNewStarts).toBe(true)
    expect(evaluateDurableInstrumentRights({ instrumentKey: 'who5', instrumentVersion: version, authorizations: [], locale: 'zh-CN', territory: 'CN' }).ok).toBe(true)
  })
  it('supports other reviewed registry identities without a key whitelist', () => {
    const independent = structuredClone(source)
    independent.identity.instrumentKey = 'independent_authored_fixture'
    const proof = selfAuthoredSourceProof(independent)!
    const original = registry.getScaleInstrumentSource
    const spy = vi.spyOn(registry, 'getScaleInstrumentSource').mockImplementation((k, v) => k === independent.identity.instrumentKey && v === version ? independent : original(k, v))
    try {
      expect(evaluate({ ...policy(), selfAuthoredSourceHash: proof }, independent.identity.instrumentKey).allowNewStarts).toBe(true)
    } finally { spy.mockRestore() }
  })
  it('keeps trusted scientific applicability separate from waived external licensing', () => {
    const reviewedKey = 'academic_self_concept_mathematics_zh_cn'
    const reviewed = getScaleInstrumentSource(reviewedKey, version)!
    expect(reviewed.catalog.scientificMaturity).toBe('RESEARCH_READY')
    expect(registeredSelfAuthoredDeploymentTerritory(reviewedKey, version)).toBe(reviewed.scientificReview!.territory)
    expect(registeredSelfAuthoredDeploymentTerritory(key, version)).toBe('ZZ')
    expect(registeredSelfAuthoredDeploymentTerritory('who5', version)).toBeNull()
  })
  it('retains deployment mode and runtime identity checks', () => {
    expect(evaluate({ ...policy(), deploymentModes: ['QUESTIONNAIRE'] }).reasons).toContain('DEPLOYMENT_MODE_NOT_BOUND')
    expect(evaluate({ ...policy(), runtimePolicyHash: '0'.repeat(64) }).reasons).toContain('RUNTIME_POLICY_HASH_MISMATCH')
  })
  it('retains the external policy contract and rejects mixed authority bases', () => {
    const p = policy(); delete p.selfAuthoredSourceHash
    expect(scaleDeploymentPolicyV1Schema.safeParse(p).success).toBe(false)
    expect(scaleDeploymentPolicyV1Schema.safeParse({ ...policy(), authorizationRefs: ['fake-grant'] }).success).toBe(false)
  })
  it('does not trust caller supplied self_authored fields, and preserves language/readiness gates', () => {
    const args = { authorizations: [], locale: 'zh-CN', territory: 'ZZ', commercialNature: 'NON_COMMERCIAL' as const, deploymentModes: ['STANDALONE' as const] }
    expect(previewScaleInstrument({ ...args, instrumentKey: key, instrumentVersion: version }).allowActivation).toBe(true)
    const fake = structuredClone(getScaleInstrumentSource('who5', version)!); fake.executable!.definition.license.status = 'self_authored'; fake.executable!.definition.license.redistribution = 'allowed'
    expect(previewScaleInstrument({ ...args, source: fake }).blockers).not.toContain('SELF_AUTHORED_SOURCE_MISMATCH')
    const modified = structuredClone(source); modified.executable!.definition.items[0].content += 'changed'
    expect(selfAuthoredSourceProof(modified)).not.toBe(registeredSelfAuthoredSourceProof(key, version))
    expect(previewScaleInstrument({ ...args, source: modified }).blockers).not.toContain('SELF_AUTHORED_SOURCE_MISMATCH')
    expect(previewScaleInstrument({ ...args, instrumentKey: key, instrumentVersion: version, locale: 'en-US' }).allowActivation).toBe(false)
    const retired = structuredClone(source); retired.executable!.releaseStatus = 'RETIRED'
    expect(previewScaleInstrument({ ...args, source: retired }).blockers).toContain('EXECUTABLE_NOT_PUBLISHED')
  })
  it('projects authored provenance without inventing approval, public access or user grants', () => {
    const model = buildScaleLibraryReadModel({ viewerRole: 'ADMIN', authorizations: [], deployments: [{ scaleId: 'source', code: key, instrumentVersion: version, status: 'PUBLISHED', visibility: 'HIDDEN' }] })
    const entry = model.entries.find(e => e.identity.instrumentKey === key)!
    expect(entry.rights.status).toBe('NOT_EVALUATED')
    expect(entry.governance).toMatchObject({ catalogStatus: 'REVIEWED', scientificMaturity: 'PILOT' })
    expect(entry.availability.status).toBe('RESTRICTED')
    expect(entry.availability.launch).toBeUndefined()
    expect(entry.availability.reasons).not.toContain('目录记录尚未完成治理审核。')
    expect(entry.availability.reasons.some(r => r.includes('已正式发布'))).toBe(true)
    expect(standardCatalogRecord(entry, 'TRAINING').authorization).toMatchObject({ mechanism: 'DEPLOYMENT_AND_USE_GRANT', useGrantStatus: 'NOT_EVALUATED', requiresRuntimeCheck: true })
    const uninstalled = buildScaleLibraryReadModel({ authorizations: [] }).entries.find(e => e.identity.instrumentKey === key)!
    expect(uninstalled.availability.reasons).toContain('目录记录尚未完成治理审核。')
  })
  it('preserves immutable installed definitions despite scientifically neutral source corrections', () => {
    const previous = structuredClone(source.executable!.definition); previous.license.status = 'authorized'
    expect(hashScaleDefinition(previous)).toBe(hashScaleDefinition(source.executable!.definition))
    expect(allowsScaleAxisRevision(previous, source.executable!.definition)).toBe(false)
  })
})

describe('STANDARD sources cannot masquerade through the self-authored path', () => {
  it('submissionSource requires the actor to own a PRIVATE published custom release', async () => {
    const { submissionSource } = await import('../../modules/scale-library-governance/source')
    const systemAdmin = '0'.repeat(18)
    // A registered platform STANDARD source fails the private-ownership and
    // CUSTOM_DESCRIPTIVE gates before any snapshot is built.
    await expect(submissionSource({} as never, systemAdmin, {
      requestId: '00000000-0000-4000-8000-000000000001', releaseId: 'standard:academic_self_concept_chinese_zh_cn', version: 1,
      metadata: { title: '伪自编', author: '', copyright: '', applicability: '', scoringDescription: '', reportDescription: '' },
      dependencyReleaseIds: [],
    } as never)).rejects.toThrow()
  })
})
