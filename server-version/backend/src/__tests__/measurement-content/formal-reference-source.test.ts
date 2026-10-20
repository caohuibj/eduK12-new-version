import {referenceConsentBodyHash} from '../../modules/measurement-content/reference-candidate'
import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {ids,sourceFixture} from './formal-reference.fixture'
const mocks=vi.hoisted(()=>({owner:vi.fn(),authority:vi.fn(),release:vi.fn()}))
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:mocks.owner}))
vi.mock('../../modules/measurement-content/content-authority.repository',()=>({assertContentAuthority:mocks.authority}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release}))
import {verifySurveyReferenceCandidate,surveyReferenceConsentEvidence,assertSurveyReferenceSubmissionAuthority} from '../../modules/survey/reference-candidates.service'
let fixture:ReturnType<typeof sourceFixture>
const wave=()=>({consent_text:'Research aggregate analysis of this specified population',consent_version:1,linkage_notice_confirmed:false,
  snapshot:{consentVersion:1,purpose:'RESEARCH_ONLY',consentDigest:canonicalHash({text:'Research aggregate analysis of this specified population',version:1,linkedConfirmed:false})}})
beforeEach(()=>{
  vi.resetAllMocks();fixture=sourceFixture();mocks.owner.mockResolvedValue({})
  mocks.release.mockResolvedValue({releaseId:ids.measurement,layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',
    scope:fixture.source.scope,provenance:{},contentHash:fixture.source.measurement.contentHash,
    content:{...fixture.source.measurement,metrics:[{metricKey:'total'}]}})
})
describe('Survey formal source consent and lifecycle fences',()=>{
  it('rechecks trusted source revision and source-owner analyze authority, never reviewer impersonation',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValue([{source_revision:1,measurement:{releaseId:ids.measurement,contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}]),
      surveyWaveFinal:{count:vi.fn().mockResolvedValue(2)}} as any
    const result=await verifySurveyReferenceCandidate(tx,fixture.source,ids.grant)
    expect(result.facts).toEqual(fixture.facts)
    expect(mocks.authority).toHaveBeenCalledTimes(2)
    expect(mocks.authority).toHaveBeenCalledWith(tx,expect.objectContaining({actorId:'analyst',grantId:ids.grant,capability:'reference.analyze'}))
  })
  it('fails current withdrawal/quality revision change and revoked measurement',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValue([{source_revision:2,measurement:{}}]),surveyWaveFinal:{count:vi.fn()}} as any
    await expect(verifySurveyReferenceCandidate(tx,fixture.source,ids.grant)).rejects.toThrow('REFERENCE_SURVEY_SOURCE_CHANGED')
    mocks.release.mockResolvedValueOnce({...await mocks.release(),status:'REVOKED'})
    await expect(verifySurveyReferenceCandidate(tx,fixture.source,ids.grant)).rejects.toThrow('REFERENCE_SURVEY_MEASUREMENT_MISMATCH')
  })
  it('exposes accepted immutable consent scope only with complete exact sample coverage',async()=>{
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([wave()]).mockResolvedValueOnce([{count:2n}])} as any
    const evidence=await surveyReferenceConsentEvidence(tx,fixture.source)
    expect(evidence).toEqual([{version:'1',scopeHash:wave().snapshot.consentDigest,purpose:wave().consent_text,body:wave().consent_text,bodyHash:referenceConsentBodyHash(wave().consent_text),dataCategories:['SCALE']}])
    expect(JSON.stringify(evidence)).not.toContain('private-person')
  })
  it('rejects changed consent text/digest and missing individual acceptance without widening consent',async()=>{
    const changed=wave();changed.consent_text='Changed consent scope'
    const tx={$queryRaw:vi.fn().mockResolvedValueOnce([changed])} as any
    await expect(surveyReferenceConsentEvidence(tx,fixture.source)).rejects.toThrow('REFERENCE_CONSENT_EVIDENCE_UNAVAILABLE')
    tx.$queryRaw.mockResolvedValueOnce([wave()]).mockResolvedValueOnce([{count:1n}])
    await expect(surveyReferenceConsentEvidence(tx,fixture.source)).rejects.toThrow('REFERENCE_CONSENT_EVIDENCE_UNAVAILABLE')
  })
})

it('terminal source authority returns the original grant version without rereading samples or statistics',async()=>{
  const tx={$queryRaw:vi.fn()} as any
  mocks.authority.mockResolvedValue({grantId:ids.grant,version:7})
  expect(await assertSurveyReferenceSubmissionAuthority(tx,fixture.source,ids.grant)).toEqual({grantId:ids.grant,version:7})
  expect(mocks.owner).toHaveBeenCalledWith(tx,'analyst',ids.project,false)
  expect(mocks.release).not.toHaveBeenCalled();expect(tx.$queryRaw).not.toHaveBeenCalled()
})
