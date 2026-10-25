import {beforeEach,describe,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {encryptUnifiedRuntimePayload,decryptUnifiedRuntimePayload} from '../../modules/assessment-runtime/security'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
import type {AssessmentReferenceEntry} from '../../modules/assessment-reference/reference'
import {bindSurveyAttemptContent,decodeSurveyAttemptContentBinding,surveyAttemptContentBindingSchema} from '../../modules/survey/content-binding.service'
const mocks=vi.hoisted(()=>({release:vi.fn(),assigned:vi.fn(),collection:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.release}))
vi.mock('../../modules/survey/flow.assignment',()=>({assignedSurveySnapshot:mocks.assigned}))
vi.mock('../../modules/survey/scale-collection-guard',()=>({assertSurveyScaleCollectionAllowed:mocks.collection}))
const scope={projectId:'project',waveId:'wave',attemptId:'attempt',publicationId:'publication'}
const exact={releaseId:'measurement',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
const entry={scoreKey:'metric',referenceKind:'descriptive_sample',evidenceLevel:'local_pilot',provenanceType:'local_observed',
  population:{description:'General sample'},source:{citation:'Synthetic'},statistics:{mean:1},instrumentVersion:'1',scoringVersion:'1'} as AssessmentReferenceEntry
const referenceHash='c'.repeat(64),reportHash='d'.repeat(64)
const choice={releaseId:'reference',contentHash:referenceHash,entryKey:referenceEntryKey(entry),metricKey:'metric',referenceKind:'descriptive_sample',priority:1}
function snapshot(){return {schemaVersion:1,projectId:'project',waveId:'wave',runtimeStatus:'SURVEY_FINAL_V1',units:[{
  kind:'SCALE',instrumentKey:'scale',measurementRelease:exact,contentSelection:{referencePolicy:{policyVersion:'EXACT_POPULATION_PRIORITY_V1',
    measurementReleaseId:'measurement',choices:[choice]},reportRelease:{releaseId:'report',contentHash:reportHash}}}]}}
function fixture(){
  const frozen=snapshot(),row={content_binding_cipher:null as string|null,content_binding_hash:null as string|null,flow_assignment_cipher:null as string|null,
    owner_id:'owner',definition_digest:canonicalHash(frozen),compiled_snapshot:frozen}
  const tx={$queryRaw:vi.fn(async()=>[row]),$executeRaw:vi.fn(async()=>1)}
  const run=(newAttempt=true)=>bindSurveyAttemptContent(tx as never,{...scope,newAttempt})
  const saved=()=>{const args=tx.$executeRaw.mock.calls[0] as unknown as [{values:unknown[]}]
    return surveyAttemptContentBindingSchema.parse(decryptUnifiedRuntimePayload(args[0].values[0] as string))}
  return {frozen,row,tx,run,saved}
}
let releases:Record<string,any>
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('DATA_ENCRYPTION_KEY','ab'.repeat(32))
  const privateScope={kind:'PRIVATE',product:'SURVEY',resourceId:'project',ownerId:'owner'}
  releases={measurement:{releaseId:'measurement',layer:'MEASUREMENT',family:'SCALE',status:'PUBLISHED',scope:privateScope,
      contentHash:exact.contentHash,content:{measurementHash:exact.measurementHash}},
    reference:{releaseId:'reference',layer:'REFERENCE',family:'SCALE',status:'PUBLISHED',scope:privateScope,contentHash:referenceHash,
      content:{measurement:{releaseId:'measurement',contentHash:exact.contentHash},entries:[{definition:entry}]}},
    report:{releaseId:'report',layer:'REPORT',family:'SCALE',status:'PUBLISHED',scope:privateScope,contentHash:reportHash,
      content:{measurements:[{releaseId:'measurement',contentHash:exact.contentHash}],template:{secret:'private template'}}}}
  mocks.release.mockImplementation(async(_tx,id)=>releases[id]);mocks.assigned.mockImplementation(value=>value)
})
describe('Survey START exact encrypted content binding',()=>{
  it('refuses a current collection fence before selecting or writing a content binding',async()=>{
    const f=fixture();mocks.collection.mockRejectedValueOnce(new Error('synthetic collection stop'))
    await expect(f.run()).rejects.toThrow('synthetic collection stop')
    expect(mocks.collection).toHaveBeenCalledWith(f.tx,f.frozen)
    expect(mocks.release).not.toHaveBeenCalled();expect(f.tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('stores only exact selected pointers, empty population and report availability under CAS',async()=>{
    const f=fixture();await expect(f.run()).resolves.toBeUndefined()
    const binding=f.saved()
    expect(binding).toMatchObject({...scope,populationContext:{},units:[{instrumentKey:'scale',measurement:exact,
      references:[{status:'SELECTED',releaseId:'reference',entryKey:choice.entryKey}],report:{releaseId:'report',contentHash:reportHash},reportAvailability:'AVAILABLE'}]})
    expect(JSON.stringify(binding)).not.toMatch(/private template|statistics|priority|choices|General sample/)
    expect(mocks.release).toHaveBeenCalledWith(f.tx,'measurement',true)
    expect(mocks.release).toHaveBeenCalledWith(f.tx,'reference',true)
    expect(mocks.release).toHaveBeenCalledWith(f.tx,'report',true)
    expect(f.tx.$executeRaw.mock.calls[0][0].strings.join(' ')).toContain('content_binding_cipher IS NULL AND content_binding_hash IS NULL')
    expect(f.tx.$executeRaw.mock.calls[0][0].values[1]).toBe(canonicalHash(binding))
  })
  it.each(['SUPERSEDED','RETIRED'])('keeps frozen %s measurement/report identities for START',async status=>{
    releases.measurement.status=status;releases.report.status=status
    const f=fixture();await f.run();expect(f.saved().units[0].measurement).toEqual(exact)
  })
  it('denies revoked measurement but records revoked report as unavailable without blocking collection',async()=>{
    const f=fixture();releases.measurement.status='REVOKED';await expect(f.run()).rejects.toThrow()
    expect(f.tx.$executeRaw).not.toHaveBeenCalled()
    releases.measurement.status='PUBLISHED';releases.report.status='REVOKED';await f.run()
    expect(f.saved().units[0]).toMatchObject({reportAvailability:'REVOKED',report:{releaseId:'report',contentHash:reportHash}})
  })
  it.each([['REVOKED','REVOKED'],['RETIRED','RETIRED']])('records reference %s as unavailable',async(status,reason)=>{
    releases.reference.status=status;const f=fixture();await f.run()
    expect(f.saved().units[0].references).toEqual([{metricKey:'metric',referenceKind:'descriptive_sample',status:'UNAVAILABLE',reason}])
  })
  it('preserves superseded reference candidate and refuses to infer missing population',async()=>{
    releases.reference.status='SUPERSEDED';let f=fixture();await f.run();expect(f.saved().units[0].references[0].status).toBe('SELECTED')
    const restricted={...entry,population:{match:{gradeLevels:['grade-1']}}}
    releases.reference.content.entries=[{definition:restricted}]
    f=fixture();f.frozen.units[0].contentSelection.referencePolicy.choices[0]={...choice,entryKey:referenceEntryKey(restricted)}
    f.row.definition_digest=canonicalHash(f.frozen);await f.run()
    expect(f.saved().units[0].references[0]).toMatchObject({status:'UNAVAILABLE',reason:'MISSING_CONTEXT'})
  })
  it('uses actual project owner, denying other project/owner/layer/hash instead of trusting anonymous actor',async()=>{
    for(const mutate of [()=>{releases.report.scope={...releases.report.scope,ownerId:'participant'}},
      ()=>{releases.report.scope={...releases.report.scope,resourceId:'foreign'}},
      ()=>{releases.report.layer='REFERENCE'},()=>{releases.report.contentHash='e'.repeat(64)}]){
      const old=structuredClone(releases.report);mutate();const f=fixture();await expect(f.run()).rejects.toThrow()
      expect(f.tx.$executeRaw).not.toHaveBeenCalled();releases.report=old
    }
  })
  it('binds new native measurement without selections to empty references and leaves legacy/FORM-only rows null',async()=>{
    const f=fixture();delete (f.frozen.units[0] as any).contentSelection;f.row.definition_digest=canonicalHash(f.frozen)
    await f.run();expect(f.saved().units[0]).toEqual({instrumentKey:'scale',measurement:exact,references:[]})
    const old=fixture();delete (old.frozen.units[0] as any).measurementRelease;delete (old.frozen.units[0] as any).contentSelection
    old.row.definition_digest=canonicalHash(old.frozen);await old.run();expect(old.tx.$executeRaw).not.toHaveBeenCalled()
    await old.run(false);expect(old.tx.$executeRaw).not.toHaveBeenCalled()
  })
  it('recovers original binding without reselecting or rewriting after release retirement/revocation',async()=>{
    const f=fixture();await f.run();const saved=f.saved()
    f.row.content_binding_cipher=encryptUnifiedRuntimePayload(saved);f.row.content_binding_hash=canonicalHash(saved)
    releases.reference.status='REVOKED';releases.report.status='REVOKED';releases.measurement.status='REVOKED'
    f.tx.$executeRaw.mockClear();await f.run(false);expect(f.tx.$executeRaw).not.toHaveBeenCalled()
    expect(decryptUnifiedRuntimePayload(f.row.content_binding_cipher)).toEqual(saved)
  })
  it('does not backfill old Attempt even if its publication now has exact release metadata',async()=>{
    const f=fixture();await f.run(false);expect(f.tx.$executeRaw).not.toHaveBeenCalled();expect(mocks.release).not.toHaveBeenCalled()
  })
  it('fails changed stored hash, wrong Attempt, corrupted publication, and CAS conflict',async()=>{
    const f=fixture();await f.run();const saved=f.saved();f.tx.$executeRaw.mockClear()
    f.row.content_binding_cipher=encryptUnifiedRuntimePayload(saved);f.row.content_binding_hash='f'.repeat(64)
    await expect(f.run(false)).rejects.toThrow()
    const wrong={...saved,attemptId:'other'};f.row.content_binding_cipher=encryptUnifiedRuntimePayload(wrong);f.row.content_binding_hash=canonicalHash(wrong)
    await expect(f.run(false)).rejects.toThrow();expect(f.tx.$executeRaw).not.toHaveBeenCalled()
    const corrupt=fixture();corrupt.row.definition_digest='f'.repeat(64);await expect(corrupt.run()).rejects.toThrow()
    const conflict=fixture();conflict.tx.$executeRaw.mockResolvedValueOnce(0);await expect(conflict.run()).rejects.toThrow()
  })
  it('pure recovery validates report and selected reference membership without choosing again',async()=>{
    const f=fixture();await f.run();const original=f.saved()
    const decode=(binding:typeof original)=>decodeSurveyAttemptContentBinding({...scope,definitionDigest:f.row.definition_digest,
      selectedSnapshot:f.frozen as never,contentBindingCipher:encryptUnifiedRuntimePayload(binding),contentBindingHash:canonicalHash(binding)})
    expect(decode(original)).toEqual(original)
    const wrongReport=structuredClone(original);wrongReport.units[0].report!.releaseId='other'
    expect(()=>decode(wrongReport)).toThrow()
    const wrongReference=structuredClone(original);(wrongReference.units[0].references[0] as any).entryKey='e'.repeat(64)
    expect(()=>decode(wrongReference)).toThrow()
    const missingSlot=structuredClone(original);missingSlot.units[0].references=[];expect(()=>decode(missingSlot)).toThrow()
    expect(()=>decodeSurveyAttemptContentBinding({...scope,definitionDigest:f.row.definition_digest,selectedSnapshot:f.frozen as never,
      contentBindingCipher:null,contentBindingHash:'a'.repeat(64)})).toThrow()
  })
  it('uses persisted assigned variant before selecting releases',async()=>{
    const f=fixture();f.row.flow_assignment_cipher=encryptUnifiedRuntimePayload({groupKey:'group-a'})
    mocks.assigned.mockReturnValueOnce({...f.frozen,units:[]});await f.run()
    expect(mocks.assigned).toHaveBeenCalledWith(f.frozen,{groupKey:'group-a'})
    expect(mocks.release).not.toHaveBeenCalled();expect(f.tx.$executeRaw).not.toHaveBeenCalled()
  })
})
