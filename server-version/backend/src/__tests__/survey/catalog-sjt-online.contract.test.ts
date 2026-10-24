import { describe, expect, it, vi } from 'vitest'
import fixture from '../../modules/situational/authoring/examples/online-hand-calculated.json'
import { compileSjtOnlineDocument, normalizeSjtOnlineResponses } from '../../modules/situational/authoring/online'
import { normalizeSituationalResponses } from '../../modules/situational/situational-final-submit.service'
import { projectReachableSituationDefinitionForScoring, deriveAuthoritativeSituationalTrajectory } from '../../modules/situational/situation-trajectory'
import { scoreSituationalModel } from '../../modules/situational/situation-model-resolver'
import { canonicalHash } from '../../modules/assessment-runtime/canonical'
import { adaptCatalogSjt, getCatalogSourceSnapshot, catalogAdapterForRecheck, ONLINE_SJT_ADAPTER_VERSION, CATALOG_ADAPTER_VERSION } from '../../modules/survey/catalog.sources'
import { compileCatalogUnit } from '../../modules/survey/catalog.service'
import { computeSurveyFinal } from '../../modules/survey/final.compute'
import type { ResearchFrozenPublication } from '../../modules/survey/publication.service'
import { validateSituationPackage, type SituationPackage } from '../../modules/situational/situation-package'
import { getOwnResearchTask } from '../../modules/survey/task.public'
const h = vi.hoisted(() => ({ own: vi.fn(), authority: vi.fn() }))
vi.mock('../../modules/situational/entry-authority', async original => ({...await original<object>(),assertSjtEntryDistributionAuthority:h.authority}))
import {SjtEntryAuthorityError} from '../../modules/situational/entry-authority'
vi.mock('../../modules/survey/admission.service', () => ({ verifiedSurveyAttempt: h.own }))
const ref = { kind: 'SJT' as const, sourceId: 'authorized-release', sourceVersion: '1.0.0' }
const published = (document: unknown = fixture): SituationPackage => ({ ...compileSjtOnlineDocument(document).package, releaseStatus: 'PUBLISHED' })
function publication(pkg: SituationPackage) {
  const imported = adaptCatalogSjt(ref, '授权工具', pkg)
  const unit = compileCatalogUnit({ id: 'draft', instrumentKey: 'sjt', kind: 'SJT', title: '授权工具', revision: 1, definition: imported.displayDefinition }, imported)
  const snapshot: ResearchFrozenPublication = { schemaVersion: 1, purpose: 'RESEARCH_ONLY', projectId: 'project', waveId: 'wave', collectionMode: 'SINGLE_UNLINKED', consentVersion: 1, linkageNoticeConfirmed: false, consentDigest: 'consent', units: [unit], runtimeStatus: 'SURVEY_FINAL_V1' }
  return { imported, snapshot }
}
const answersFor = (responses: Array<{ channelKey: string; status: string; responseValue?: unknown }>) => Object.fromEntries(responses.map(r => [r.channelKey, r.status === 'REFUSED' ? { _surveyRefusal: true } : r.status === 'ANSWERED' ? r.responseValue : null]))

describe('authorized online SJT uses the shared Training protocol core', () => {
  it('retains exact definition, online display, model and source digests without flattening', () => {
    const pkg = published(), original = structuredClone(pkg), { imported } = publication(pkg)
    expect(pkg).toEqual(original)
    expect(imported.adapterVersion).toBe(ONLINE_SJT_ADAPTER_VERSION)
    expect(imported.compiledDefinition).toEqual(pkg.definition)
    expect(imported.displayDefinition).toEqual(pkg.online!.display)
    expect(imported.definitionDigest).toBe(canonicalHash(pkg.definition))
    expect(imported.scoringDigest).toBe(canonicalHash(pkg.definition.scoring))
  })
  it.each(['AUTHOR_KEY_SUM', 'EXPERT_KEY'] as const)('preserves %s metrics, missingness and mother-scene coverage through Survey FINAL', model => {
    const document = structuredClone(fixture)
    document.display.scoring.modelKey = model
    if (model === 'EXPERT_KEY') for (const golden of document.goldenCases) if (golden.expected.cooperation !== null) golden.expected.cooperation /= 3
    const pkg = published(document), { snapshot } = publication(pkg)
    for (const golden of document.goldenCases) {
      const online = normalizeSjtOnlineResponses(pkg.online!.display, pkg.definition, golden.responses)
      const responses = normalizeSituationalResponses(pkg.definition, online.responses)
      const normalized = { responses, trajectory: deriveAuthoritativeSituationalTrajectory(pkg.definition, responses) }
      const definition = projectReachableSituationDefinitionForScoring(pkg.definition, normalized.trajectory)
      const training = scoreSituationalModel(definition, normalized.responses, { responsesValidated: true,
        independentSceneKeyBySceneKey: Object.fromEntries((pkg.definition as any).flow.nodes.filter((n: any) => n.nodeType === 'SCENE').map((n: any) => [n.sceneKey, n.motherSceneKey])) })
      const survey = computeSurveyFinal(snapshot, { sjt: answersFor(golden.responses) }).units[0]
      expect(survey.privateScoring).toMatchObject(training)
      expect((survey.privateScoring as ReturnType<typeof scoreSituationalModel>).metrics[0].value).toBe(golden.expected.cooperation)
      expect(survey.rawAnswers).toEqual(online.rawAnswers)
      expect(survey.missing).toEqual(online.missing)
      expect(survey.measurement).toBeDefined()
    }
  })
  it('public task preserves multi-select/refusal/scenes but never discloses scoring contributions', async () => {
    const { snapshot } = publication(published())
    h.own.mockResolvedValue({ status: 'STARTED', attemptId: 'attempt', waveId: 'wave', compiledSnapshot: snapshot, definitionDigest: canonicalHash(snapshot) })
    const task = await getOwnResearchTask({ publicId: 'public', attemptId: 'attempt', accessCredential: 'synthetic' })
    const serialized = JSON.stringify(task)
    expect(task.units[0]).toMatchObject({ kind: 'SJT', schemaVersion: 2, orderPolicy: 'FIXED' })
    expect(serialized).toContain('MULTIPLE'); expect(serialized).toContain('"allowRefusal":true')
    for (const key of ['contributions', 'expertKey', 'scoring', 'compiledDefinition']) expect(serialized).not.toContain('"' + key + '"')
  })
  it('rejects forged display, forged scoring, missing required answer and illegal selection', () => {
    const pkg = published(), broken = structuredClone(pkg)
    broken.online!.display.scenes[0].questions[0].prompt += 'changed'
    expect(() => publication(broken)).toThrow('SOURCE_SJT_INVALID')
    const score = structuredClone(pkg); score.definition.scoring.model!.expertKey![0].contribution += 1
    expect(() => publication(score)).toThrow('SOURCE_SJT_INVALID')
    const { snapshot } = publication(pkg)
    expect(() => computeSurveyFinal(snapshot, { sjt: { first: 'forged' } })).toThrow()
    expect(() => computeSurveyFinal(snapshot, { sjt: { third: ['a', 'a'] } })).toThrow()
    const required = structuredClone(fixture); required.display.scenes[0].questions[0].required = true; required.goldenCases = required.goldenCases.filter(c => c.responses.some(r => r.channelKey === 'first'))
    const { snapshot: requiredSnapshot } = publication(published(required))
    expect(() => computeSurveyFinal(requiredSnapshot, { sjt: {} })).toThrow()
  })
  it('retains released online images but rejects registry images without source asset authority', () => {
    const image = structuredClone(fixture) as any
    image.display.scenes[0].image = { asset: { assetId: 'image', contentHash: 'a'.repeat(64), mimeType: 'image/png' }, altText: '情境图', rightsStatus: 'self_authored', rightsNote: 'synthetic' }
    expect((publication(published(image)).imported.displayDefinition as any).scenes[0].image).toEqual(image.display.scenes[0].image)
    expect(() => adaptCatalogSjt({ ...ref, sourceId: 'registry:unbound' }, 'SJT', published(image))).toThrow('SOURCE_SJT_ONLINE_MEDIA_REQUIRES_AUTHORIZED_DELIVERY')
  })
  it('rechecks an existing raw-channel grant with its original adapter identity', () => {
    const document: any = structuredClone(fixture)
    document.display.scenes = [{ ...document.display.scenes[0], sceneKey: 'sjt_q_first', questions: [{ ...document.display.scenes[0].questions[0], required: true, allowRefusal: false }] }]
    document.goldenCases = [{ name: 'first option', responses: [{ sceneKey: 'sjt_q_first', channelKey: 'first', status: 'ANSWERED', responseValue: ['a'] }], expected: { cooperation: 1 } }]
    const pkg = published(document)
    const old = adaptCatalogSjt(ref, '授权工具', { ...pkg, online: undefined })
    const current = adaptCatalogSjt(ref, '授权工具', pkg)
    expect(old.adapterVersion).toBe(CATALOG_ADAPTER_VERSION)
    expect(current.adapterVersion).toBe(ONLINE_SJT_ADAPTER_VERSION)
    expect(catalogAdapterForRecheck(current, old)).toEqual(old)
  })
})


describe('Survey catalog does not widen Training course-scoped authorization', () => {
  const sourceDatabase = (authorizationPolicy: unknown) => {
    const pkg = published()
    return { $queryRaw: vi.fn().mockResolvedValue([]), sjtAuthorRelease: { findFirst: vi.fn().mockResolvedValue({
      id: ref.sourceId, package: pkg, status: 'PUBLISHED', instrumentKey: pkg.key, instrumentVersion: pkg.instrumentVersion,
      definitionHash: validateSituationPackage(pkg).definitionHash, authorizationPolicy,
    }) } }
  }
  it.each(['FUTURE_POLICY', undefined])('rejects restricted or unknown policy %s before catalog adaptation', async policy => {
    const db = sourceDatabase(policy)
    await expect(getCatalogSourceSnapshot({ actorUserId: 'survey-admin', ref }, db as never)).rejects.toThrow('SOURCE_SJT_AUTHORIZATION_POLICY_UNSUPPORTED')
  })
  it('requires explicit Survey distribution instead of treating a course policy as permission',async()=>{
    const db=sourceDatabase('COURSE_GRANT_V1')
    h.authority.mockRejectedValueOnce(new SjtEntryAuthorityError('SOURCE_SJT_ENTRY_AUTHORITY_REQUIRED'))
    await expect(getCatalogSourceSnapshot({actorUserId:'survey-admin',ref},db as never)).rejects.toMatchObject({code:'SOURCE_SJT_ENTRY_AUTHORITY_REQUIRED',statusCode:403})
    const receipt={protocol:'sjt-survey-distribution-v1',actorId:'survey-admin',grantId:'capability',grantVersion:1}
    h.authority.mockResolvedValueOnce(receipt)
    const result=await getCatalogSourceSnapshot({actorUserId:'survey-admin',ref},db as never)
    expect(result.provenance.sjtEntryAuthority).toEqual(receipt)
    expect(result.compiledDefinition).toEqual(published().definition)
    expect(h.authority).toHaveBeenLastCalledWith(db,{actorId:'survey-admin',releaseId:ref.sourceId,instrumentVersion:ref.sourceVersion})
  })
  it('accepts an explicitly unrestricted published release while preserving exact source identity', async () => {
    const db = sourceDatabase(null)
    const result = await getCatalogSourceSnapshot({ actorUserId: 'survey-admin', ref }, db as never)
    expect(result.adapterVersion).toBe(ONLINE_SJT_ADAPTER_VERSION)
    expect(db.sjtAuthorRelease.findFirst).toHaveBeenCalledWith({ where: { id: ref.sourceId, instrumentVersion: ref.sourceVersion, status: 'PUBLISHED' } })
  })
})
