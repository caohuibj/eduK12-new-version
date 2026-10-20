import { beforeEach, describe, expect, it, vi } from 'vitest'
const media = vi.hoisted(() => ({ retain: vi.fn() }))
vi.mock('../../config/database', () => ({ prisma: {} }))
vi.mock('../../modules/scale/scale-image.adapter', () => ({ publishedScaleMediaOwner: (id: string, hash: string) => ({ id, hash }), retainScaleAssessmentImages: media.retain }))
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { compileResearchScale } from '../../modules/survey/builder.compiler'
import { getScaleInstrumentRuntimePolicy, getScaleInstrumentSource } from '../../modules/scale/onboarding/instrument-registry'
import { hashScaleDeploymentPolicy } from '../../modules/scale/policy/deployment'
import { mapAuthorizationRowToDomain } from '../../modules/assessment-authorization/repository'
import { hashInstrumentAuthorizationRecord } from '../../modules/assessment-authorization/records'
import {getCatalogSourceSnapshot,assertCatalogSourcesCurrent,recheckCatalogScaleSourceExpiry} from '../../modules/survey/catalog.sources'
import {compileCatalogUnit} from '../../modules/survey/catalog.service'
import {surveyMeasurementReleaseInput,resolveSurveyMeasurementUnit,publishSurveyMeasurementUnit} from '../../modules/survey/publication.service'
import {getContentReleaseBatch} from '../../modules/measurement-content/repository'
import { convertLegacyScaleMeasurement, planLegacyScaleMeasurementConversion } from '../../modules/scale/onboarding/measurement-conversion'
const input = { requestId: '00000000-0000-4000-8000-000000000001', scaleId: 'scale', actorUserId: 'author', recoveryPoint: 'isolated-restored-snapshot-42' }
const at = new Date('2026-10-20T06:00:00Z')
function harness(standard = false) {
  const registered = getScaleInstrumentSource('academic_self_concept_biology_zh_cn', '1.0.0')!
  const definition = structuredClone(standard ? registered.executable!.definition : compileResearchScale('自编量表', { schemaVersion: 1, respondentType: 'participant_self_report', aggregation: 'mean', responseOptions: [{ optionKey: 'low', label: '较少', score: 1 }, { optionKey: 'high', label: '较多', score: 2 }], dimensions: [{ dimensionKey: 'effort', label: '投入', direction: 'descriptive' }], items: [{ itemKey: 'one', prompt: '愿意尝试', required: true, reverse: false, dimensionKeys: ['effort'] }] }))
  const state = { scale: { id: 'scale', code: standard ? registered.identity.instrumentKey : 'CUSTOM_one', instrumentVersion: standard ? '1.0.0' : '2.0.0',
    instrumentClass: standard ? 'STANDARD' : 'CUSTOM_DESCRIPTIVE', status: 'PUBLISHED', visibility: 'COURSE', creatorId: 'author',
    updatedAt: at, definition, definitionHash: hashScaleDefinition(definition), copySource: null, measurementReleaseId: null } as any,
    actor: { id: 'author', account_domain: 'TRAINING', role: 'TEACHER', platform_role: standard ? 'SYSTEM_ADMIN' : 'STANDARD',
      teacher_approved: true, is_active: true, is_frozen: false, must_change_password: false, expires_at: null } as any,
    releases: new Map<string, any>(), audits: new Map<string, any>(), clock: at, active: true, failAudit: false, cas: true,
    expireOnRelease: false, releaseStatus: 'PUBLISHED', history: { answers: 'original-encrypted', result: 'original-score', measurementReleaseId: null }, calls: [] as string[] }
  const auth: any = { id: 'auth-row', authorizationKey: '00000000-0000-4000-8000-000000000011', version: 1,
    instrumentKey: registered.identity.instrumentKey, instrumentVersion: '1.0.0', grantor: 'Synthetic owner', grantee: 'Synthetic deployment',
    electronicAdministration: true, scoring: true, display: true, translation: true, territories: ['CN'], locales: ['zh-CN'],
    commercialNature: 'NON_COMMERCIAL', validFrom: new Date('2020-01-01'), validTo: new Date('2099-01-01'), basis: 'TEST ONLY',
    status: 'APPROVED', evidenceAssetId: null, evidenceSha256: null, selfApprovalDeclaration: null,
    approvedByUserId: 'author', approvedAt: at, createdByUserId: 'author', createdAt: at, updatedAt: at }
  const rehash = () => { auth.recordHash = hashInstrumentAuthorizationRecord(mapAuthorizationRowToDomain(auth)) }; rehash()
  const policy = { schemaVersion: 1 as const, revision: 1, locale: 'zh-CN', territory: 'CN', commercialNature: 'NON_COMMERCIAL' as const,
    deploymentModes: ['COMPOSITE' as const], requiredRightsActions: ['electronicAdministration' as const, 'scoring' as const, 'display' as const],
    authorizationRefs: [auth.authorizationKey], runtimePolicyHash: getScaleInstrumentRuntimePolicy(registered.identity.instrumentKey, '1.0.0')!.runtimePolicyHash,
    localizationVersion: registered.localization!.localizationVersion, inFlightCompletion: 'FROZEN_DEADLINE' as const }
  const deployment = { id: 'deployment', scaleId: 'scale', revision: 1, status: 'ACTIVE', policyJson: policy,
    policyHash: hashScaleDeploymentPolicy(policy), authorizationRefs: policy.authorizationRefs, createdByUserId: 'author', createdAt: at, activatedAt: at, retiredAt: null }
  const db: any = {
    scale: { findUnique: vi.fn(async () => structuredClone(state.scale)),findFirst:vi.fn(async()=>structuredClone(state.scale)),findMany:vi.fn(async()=>[structuredClone(state.scale)]) },
    user: { findUnique: vi.fn(async () => ({ id: 'author', platformRole: state.actor.platform_role, isActive: state.actor.is_active,
      isFrozen: state.actor.is_frozen, expiresAt: state.actor.expires_at })) },
    instrumentAuthorization: { findMany: vi.fn(async () => [structuredClone(auth)]) },
    assessmentReferenceSet: { findUnique: vi.fn(async ({ where }: any) => { const reference = registered.executable!.references.find(r =>
      r.referenceVersion === where.instrumentType_instrumentKey_referenceVersion.referenceVersion); return reference ? { definition: reference, status: 'ACTIVE' } : null }) },
    scalePublicationAudit: { findUnique: vi.fn(async ({ where }: any) => state.audits.get(where.id) ?? null),
      create: vi.fn(async ({ data }: any) => { if (state.failAudit) throw new Error('audit failure'); state.audits.set(data.id, structuredClone(data)); return data }) },
    $queryRaw: vi.fn(async (query: any) => {
      const sql = query.sql ?? query.join('?'), values = query.values ?? []; state.calls.push(sql)
      if (sql.includes('clock_timestamp()')) return [{ now: state.clock }]
      if (sql.includes('FROM users')) return [structuredClone(state.actor)]
      if (sql.includes('FROM scales') || sql.includes('FROM "scales"')) return [{ id: state.scale.id,code:state.scale.code,instrument_version:state.scale.instrumentVersion,instrument_class:state.scale.instrumentClass }]
      if (sql.includes('FROM "scale_deployment_policies"')) return state.active ? [deployment] : []
      if (sql.includes('FROM scale_deployment_policies')) return state.active ? [{ id: deployment.id }] : []
      if (sql.includes('SELECT * FROM measurement_content_releases')) {
        if (sql.includes('WHERE id IN')) return [...state.releases.values()].filter(r=>values.includes(r.id))
        if (sql.includes('WHERE id=')) return state.releases.has(values[0]) ? [state.releases.get(values[0])] : []
        return [...state.releases.values()].filter(r => r.family === values[0] && r.layer === values[1] && r.content_key === values[2] && r.version === values[3])
      }
      if (sql.includes('INSERT INTO measurement_content_releases')) {
        const [id, layer, family, key, version, hashScheme, contentHash, content, scope, provenance, assets, sourceRelease, publisher] = values
        const row = { id, layer, family, content_key: key, version, hash_scheme: hashScheme, content_hash: contentHash,
          content: JSON.parse(content), scope: JSON.parse(scope), provenance: JSON.parse(provenance), asset_refs: JSON.parse(assets),
          source_release_id: sourceRelease, published_by: publisher, published_at: at, status: state.releaseStatus }
        state.releases.set(id, row); if (state.expireOnRelease) state.clock = new Date('2100-01-01T00:00:00Z'); return [row]
      }
      throw new Error('Unexpected query: ' + sql)
    }),
    $executeRaw: vi.fn(async (query: any) => {
      const sql = query.sql, values = query.values; state.calls.push(sql)
      if (sql.includes('pg_advisory_xact_lock')) return 1
      if (sql.startsWith('UPDATE scales SET measurement_release_id=')) { if (!state.cas) return 0; state.scale.measurementReleaseId = values[0]; return 1 }
      throw new Error('Unexpected write: ' + sql)
    }),
    $transaction: vi.fn(async (work: any) => {
      const saved = structuredClone({ scale: state.scale, releases: state.releases, audits: state.audits })
      try { return await work(db) } catch (error) { Object.assign(state, saved); throw error }
    }),
  }
  const preview = () => planLegacyScaleMeasurementConversion(db, input)
  const apply = async () => convertLegacyScaleMeasurement(db, { ...input, expectedProofHash: (await preview()).proofHash })
  return { db, state, auth, rehash, registered, preview, apply }
}
beforeEach(() => vi.clearAllMocks())
describe('controlled legacy Scale conversion through real validators/compiler/license/release repository', () => {
  it('previews one named source without changing publication, pointer, facts or assets', async () => {
    const h = harness(), before = structuredClone(h.state); const plan = await h.preview()
    expect(plan.proof).toMatchObject({ objectCount: 1, historicalRecordWrites: 0, originalDefinitionWrites: 0, source: { recordedHashScheme: 'LEGACY_UNRECORDED' } })
    expect(h.state.scale).toEqual(before.scale); expect(h.state.history).toEqual(before.history)
    expect(h.state.releases.size).toBe(0); expect(media.retain).not.toHaveBeenCalled()
  })
  it('writes pointer/audit only, preserves unknown hashes and recovers identical UUID/body', async () => {
    const h = harness(); h.state.scale.definitionHash = null
    const original = structuredClone(h.state.scale), history = structuredClone(h.state.history), plan = await h.preview()
    const request = { ...input, expectedProofHash: plan.proofHash }, result = await convertLegacyScaleMeasurement(h.db, request)
    expect(result.converted).toBe(true); expect(h.state.scale).toEqual({ ...original, measurementReleaseId: result.measurementReleaseId })
    expect(h.state.history).toEqual(history); expect(h.state.audits.size).toBe(1); expect(h.state.releases.size).toBe(1)
    const writes = h.db.$executeRaw.mock.calls.filter(([q]: any) => !q.sql.includes('pg_advisory_xact_lock'))
    expect(writes).toHaveLength(1); expect(writes[0][0].sql).toContain('measurement_release_id IS NULL')
    expect(await convertLegacyScaleMeasurement(h.db, request)).toMatchObject({ ...result, converted: false }); expect(media.retain).toHaveBeenCalledTimes(1)
    await expect(convertLegacyScaleMeasurement(h.db, { ...request, recoveryPoint: 'different' })).rejects.toThrow('REQUEST_CONFLICT')
  })
  it('recovery does not republish after retirement or overwrite a later explicit pointer', async () => {
    const h = harness(), plan = await h.preview(), request = { ...input, expectedProofHash: plan.proofHash }, result = await convertLegacyScaleMeasurement(h.db, request)
    h.state.releases.get(result.measurementReleaseId).status = 'REVOKED'; h.state.scale.measurementReleaseId = 'later-release'
    expect(await convertLegacyScaleMeasurement(h.db, request)).toMatchObject({ measurementReleaseId: result.measurementReleaseId, converted: false })
    expect(h.state.scale.measurementReleaseId).toBe('later-release')
  })
  it.each(['DRAFT', 'ARCHIVED', 'DEPRECATED'])('refuses source %s', async status => {
    const h = harness(); h.state.scale.status = status
    await expect(h.apply()).rejects.toThrow('SOURCE_NOT_PUBLISHED'); expect(h.state.releases.size).toBe(0)
  })
  it('refuses other owner, projected admin, expired account and unproven custom license', async () => {
    const h = harness(); h.state.scale.creatorId = 'other'; await expect(h.preview()).rejects.toThrow('AUTHOR_REQUIRED')
    h.state.scale.creatorId = 'author'; h.state.actor.role = 'ADMIN'; await expect(h.preview()).rejects.toThrow('AUTHOR_REQUIRED')
    h.state.actor.role = 'TEACHER'; h.state.actor.expires_at = at; await expect(h.preview()).rejects.toThrow('ACTOR_UNAVAILABLE')
    h.state.actor.expires_at = null; h.state.scale.definition.license.redistribution = 'unknown'; h.state.scale.definitionHash = null
    await expect(h.preview()).rejects.toThrow('CUSTOM_SOURCE_RIGHTS_UNPROVEN')
  })
  it('rejects changed source, mismatched hash, missing scorer and existing mapping', async () => {
    const h = harness(), plan = await h.preview(); h.state.scale.updatedAt = new Date(at.getTime() + 1000)
    await expect(convertLegacyScaleMeasurement(h.db, { ...input, expectedProofHash: plan.proofHash })).rejects.toThrow('PREVIEW_STALE')
    h.state.scale.definitionHash = 'a'.repeat(64); await expect(h.preview()).rejects.toThrow('DEFINITION_HASH_MISMATCH')
    h.state.scale.definitionHash = null; h.state.scale.definition.scoring.scorerKey = 'missing-plugin'; await expect(h.preview()).rejects.toThrow('DEFINITION_INVALID')
    h.state.scale.measurementReleaseId = 'other'; await expect(h.preview()).rejects.toThrow('ALREADY_MAPPED')
  })
  it('publishes STANDARD through real compiler, hashed current rights and existing publication identity', async () => {
    const h = harness(true), plan = await h.preview()
    expect(plan.proof.sourceRights?.authorization?.authorizationId).toBe(h.auth.authorizationKey)
    expect(plan.proof.standardPublicationProofHash).toMatch(/^[a-f0-9]{64}$/)
    const result = await h.apply(), release = h.state.releases.get(result.measurementReleaseId)
    expect(release.provenance).toEqual({ sourceIdentity: h.registered.identity }); expect(release.scope).toEqual({ kind: 'PLATFORM', ownerId: 'author' })
    expect(h.state.calls.findIndex(s => s.includes('pg_advisory_xact_lock_shared'))).toBeLessThan(h.state.calls.findIndex(s => s.includes('FROM users')))
  })
  it('denies absent managed deployment or revoked/tampered license', async () => {
    const h = harness(true); h.state.active = false; await expect(h.preview()).rejects.toThrow('STANDARD_PUBLICATION_BLOCKED')
    h.state.active = true; h.auth.status = 'REVOKED'; h.rehash(); await expect(h.preview()).rejects.toThrow('STANDARD_PUBLICATION_BLOCKED')
    h.auth.status = 'APPROVED'; h.auth.recordHash = 'b'.repeat(64); await expect(h.preview()).rejects.toThrow('LICENSE_HASH_MISMATCH')
  })
  it('rejects package substitution when measurement-only hash ignores a report change', async () => {
    const h = harness(true); h.state.scale.definition.report.disclaimer += ' changed'
    expect(hashScaleDefinition(h.state.scale.definition)).toBe(h.state.scale.definitionHash)
    await expect(h.preview()).rejects.toThrow('REGISTRY_DEFINITION_MISMATCH')
  })
  it('rechecks elapsed expiry after release waits and aborts', async () => {
    const h = harness(true); h.state.expireOnRelease = true; await expect(h.apply()).rejects.toThrow('MANAGED_SOURCE_LICENSE_REQUIRED')
    expect(h.state.releases.size).toBe(0); expect(h.state.scale.measurementReleaseId).toBeNull()
    const custom = harness(); custom.state.actor.expires_at = new Date('2099-01-01'); custom.state.expireOnRelease = true
    await expect(custom.apply()).rejects.toThrow('ACTOR_UNAVAILABLE')
  })
  it('rolls back release/pointer on audit failure, CAS failure or non-published release', async () => {
    for (const mode of ['audit', 'cas', 'retired']) {
      const h = harness(); h.state.failAudit = mode === 'audit'; h.state.cas = mode !== 'cas'; h.state.releaseStatus = mode === 'retired' ? 'RETIRED' : 'PUBLISHED'
      await expect(h.apply()).rejects.toThrow(); expect(h.state.releases.size).toBe(0); expect(h.state.audits.size).toBe(0); expect(h.state.scale.measurementReleaseId).toBeNull()
    }
  })
  it('requires real converted source before Survey can import, then pins source release in explicit project publication',async()=>{
    const h=harness(),ref={kind:'SCALE' as const,sourceId:'scale',sourceVersion:'2.0.0'}
    await expect(getCatalogSourceSnapshot({actorUserId:'survey-admin',ref},h.db)).rejects.toThrow('EXPLICIT_CONVERSION_REQUIRED')
    const conversion=await h.apply()
    const snapshot=await getCatalogSourceSnapshot({actorUserId:'survey-admin',ref},h.db)
    expect(snapshot.provenance.sourceMeasurementRelease).toEqual({releaseId:conversion.measurementReleaseId,contentHash:conversion.contentHash})
    const unit=compileCatalogUnit({id:'project-draft',instrumentKey:'private-source',kind:'SCALE',title:'Original',revision:1,definition:snapshot.displayDefinition},snapshot)
    expect(surveyMeasurementReleaseInput(unit,'researcher','project').sourceReleaseId).toBe(conversion.measurementReleaseId)
    await expect(resolveSurveyMeasurementUnit(h.db,unit,'researcher','project')).rejects.toThrow('显式发布')
    expect(h.state.releases.size).toBe(1)
    const release=await publishSurveyMeasurementUnit(h.db,unit,'researcher','project')
    expect(await resolveSurveyMeasurementUnit(h.db,unit,'researcher','project')).toMatchObject({releaseId:release.releaseId})
    expect(h.state.releases.size).toBe(2)
    const missing={...unit,sourceProvenance:{source:{sourceVersion:'2.0.0'}}}
    expect(()=>surveyMeasurementReleaseInput(missing,'researcher','project')).toThrow('显式版本转换')
  })
  it('Survey rejects withdrawn source release, current revoked managed license and expiry after later waits',async()=>{
    const h=harness(true),conversion=await h.apply(),ref={kind:'SCALE' as const,sourceId:'scale',sourceVersion:'1.0.0'}
    const snapshot=await getCatalogSourceSnapshot({actorUserId:'survey-admin',ref},h.db)
    await recheckCatalogScaleSourceExpiry(h.db,[snapshot])
    h.state.clock=new Date('2100-01-01');await expect(recheckCatalogScaleSourceExpiry(h.db,[snapshot])).rejects.toThrow('LICENSE_EXPIRED')
    h.state.clock=at;h.auth.status='REVOKED';h.rehash()
    await expect(getCatalogSourceSnapshot({actorUserId:'survey-admin',ref},h.db)).rejects.toThrow('MANAGED_SOURCE_LICENSE_REQUIRED')
    h.auth.status='APPROVED';h.rehash();h.state.releases.get(conversion.measurementReleaseId).status='REVOKED'
    await expect(getCatalogSourceSnapshot({actorUserId:'survey-admin',ref},h.db)).rejects.toThrow('RELEASE_NOT_PUBLISHED')
  })
  it('batch source validation deduplicates repeated grants but rejects stale snapshots and forged release bytes',async()=>{
    const h=harness(),conversion=await h.apply(),ref={kind:'SCALE' as const,sourceId:'scale',sourceVersion:'2.0.0'}
    const snapshot=await getCatalogSourceSnapshot({actorUserId:'admin',ref},h.db)
    h.db.$queryRaw.mockClear()
    await assertCatalogSourcesCurrent([{snapshot,actorUserId:'admin'},{snapshot,actorUserId:'admin'}],h.db)
    expect(h.db.$queryRaw.mock.calls.filter(([q]:any)=>q.sql.includes('measurement_content_releases'))).toHaveLength(1)
    expect(h.db.$queryRaw.mock.calls.filter(([q]:any)=>q.sql.includes('clock_timestamp'))).toHaveLength(1)
    await expect(assertCatalogSourcesCurrent([{snapshot:{...snapshot,provenance:{...snapshot.provenance,sourceMeasurementRelease:null}},actorUserId:'admin'}],h.db)).rejects.toThrow('SOURCE_SNAPSHOT_CHANGED')
    h.state.releases.get(conversion.measurementReleaseId).content_hash='a'.repeat(64)
    await expect(getContentReleaseBatch(h.db,[conversion.measurementReleaseId,conversion.measurementReleaseId],true)).rejects.toThrow('CONTENT_RELEASE_HASH_MISMATCH')
    expect(await getContentReleaseBatch(h.db,['missing'])).toEqual(new Map())
  })

  it('does not queue User SHARE behind a writer while holding source/Scale locks',async()=>{
    const h=harness(),original=h.db.$queryRaw.getMockImplementation()!
    h.db.$queryRaw.mockImplementation(async(q:any)=>{
      if(q.sql.includes('FROM users')){expect(q.sql).toContain('FOR SHARE NOWAIT');throw {code:'P2010',meta:{code:'55P03'}}}
      return original(q)
    })
    await expect(h.preview()).rejects.toThrow('ACTOR_BUSY_RETRY')
    expect(h.state.releases.size).toBe(0);expect(h.state.audits.size).toBe(0);expect(h.state.scale.measurementReleaseId).toBeNull()
  })

})
