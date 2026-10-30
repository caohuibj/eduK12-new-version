import {describe,it,expect,vi,beforeEach} from 'vitest'
const mocks=vi.hoisted(()=>({get:vi.fn(),transaction:vi.fn()}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:mocks.get,requirePublishedContentRelease:vi.fn(),publishContentRelease:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:mocks.transaction}}))
import {freezeSurveyContentSelections} from '../../modules/survey/content-selection'
import {freezeResearchWaveDraft} from '../../modules/survey/publication.service'
import {inheritedSurveyTrackingUnit,surveyTrackingDefaultSelections} from '../../modules/survey/tracking-source'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
const iid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222',pid='33333333-3333-4333-8333-333333333333'
const entry={scoreKey:'total',referenceKind:'descriptive_sample' as const,evidenceLevel:'local_pilot' as const,provenanceType:'local_observed' as const,instrumentVersion:'1',scoringVersion:'1',population:{},source:{citation:'Local'},statistics:{mean:1}}
const measurement={releaseId:'measurement',contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}
const scope={kind:'PRIVATE',ownerId:'owner',product:'SURVEY',resourceId:'project'}
const reference=()=>({releaseId:rid,contentHash:'c'.repeat(64),status:'PUBLISHED',scope,family:'SCALE',layer:'REFERENCE',content:{measurement:{releaseId:measurement.releaseId,contentHash:measurement.contentHash},entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}})
const report=()=>({releaseId:pid,contentHash:'d'.repeat(64),status:'PUBLISHED',scope,family:'SCALE',layer:'REPORT',content:{measurements:[{releaseId:measurement.releaseId,contentHash:measurement.contentHash}],template:{private:'not copied'}}})
const unit=()=>({draftId:iid,kind:'SCALE',measurementRelease:measurement} as any)
const selection=()=>({instrumentId:iid,reportReleaseId:pid,references:[{releaseId:rid,entryKey:referenceEntryKey(entry),priority:1}]})
beforeEach(()=>{vi.clearAllMocks();mocks.get.mockImplementation(async(_tx,id)=>id===rid?reference():report())})
describe('actual Wave content selection freezer',()=>{
 it('leaves private P/R unselected when an untracked D changes C, while explicit new choices still validate',async()=>{
  const prior={...unit(),instrumentKey:'D',contentSelection:undefined}
  await freezeSurveyContentSelections({} as never,'owner','project',[prior],[selection()])
  const changed={...unit(),instrumentKey:'D',measurementRelease:{...measurement,releaseId:'new-D-C',contentHash:'e'.repeat(64)}}
  const source={units:[prior],longitudinal:{metrics:[{draftId:'tracked-A'}]}} as any
  expect(inheritedSurveyTrackingUnit(source,{id:iid,instrumentKey:'D'})).toBeUndefined()
  const defaults=surveyTrackingDefaultSelections(source,[changed])
  expect(defaults.contentSelections).toEqual([])
  await freezeSurveyContentSelections({} as never,'owner','project',[changed],defaults.contentSelections)
  expect(changed).not.toHaveProperty('contentSelection')
  await expect(freezeSurveyContentSelections({} as never,'owner','project',[changed],[selection()])).rejects.toMatchObject({statusCode:409})
  mocks.get.mockImplementation(async(_tx,id)=>{
   const release=id===rid?reference():report()
   const pointer={releaseId:changed.measurementRelease.releaseId,contentHash:changed.measurementRelease.contentHash}
   return {...release,content:{...release.content,...(id===rid?{measurement:pointer}:{measurements:[pointer]})}}
  })
  await freezeSurveyContentSelections({} as never,'owner','project',[changed],[selection()])
  expect((changed as any).contentSelection.reportRelease.releaseId).toBe(pid)
 })
 it('clears an explicit empty continuation selection, but revalidates intentionally inherited private P/R',async()=>{
  const old={...unit(),instrumentKey:'A',contentSelection:undefined}
  await freezeSurveyContentSelections({} as never,'owner','project',[old],[selection()])
  const source={units:[old],longitudinal:{metrics:[{draftId:iid}]}} as any
  const next=inheritedSurveyTrackingUnit(source,{id:iid,instrumentKey:'A'})!
  expect(next.contentSelection).toBeUndefined()
  await freezeSurveyContentSelections({} as never,'owner','project',[next],[])
  expect(next.contentSelection).toBeUndefined()
  const defaults=surveyTrackingDefaultSelections(source,[next])
  await freezeSurveyContentSelections({} as never,'owner','project',[next],defaults.contentSelections)
  expect(next.contentSelection).toEqual(old.contentSelection)
  const retired=inheritedSurveyTrackingUnit(source,{id:iid,instrumentKey:'A'})!
  mocks.get.mockResolvedValue({...reference(),status:'REVOKED'})
  await expect(freezeSurveyContentSelections({} as never,'owner','project',[retired],defaults.contentSelections)).rejects.toMatchObject({statusCode:409})
  expect(retired.contentSelection).toBeUndefined()
  const approved={...old,sourceProvenance:{surveyStandardReleaseId:'approved',reportConfigured:false}}
  expect(surveyTrackingDefaultSelections({...source,units:[approved]},[approved]).contentSelections).toEqual([])
 })
 it('stores only exact pointers and policy, with locked release reads',async()=>{
  const u=unit();await freezeSurveyContentSelections({} as never,'owner','project',[u],[selection()])
  expect(u.contentSelection.referencePolicy.choices[0]).toMatchObject({releaseId:rid,entryKey:referenceEntryKey(entry),metricKey:'total',priority:1})
  expect(u.contentSelection.reportRelease).toEqual({releaseId:pid,contentHash:'d'.repeat(64)})
  expect(JSON.stringify(u.contentSelection)).not.toContain('statistics');expect(JSON.stringify(u.contentSelection)).not.toContain('template')
  expect(mocks.get.mock.calls.every(c=>c[2]===true)).toBe(true)
 })
 it('reuses a release once for multiple selected entries',async()=>{
  const second={...entry,scoreKey:'other'};const r=reference();r.content.entries.push({metricKey:'other',referenceKind:'descriptive_sample',definition:second})
  mocks.get.mockResolvedValue(r);const s=selection();delete (s as any).reportReleaseId;s.references.push({releaseId:rid,entryKey:referenceEntryKey(second),priority:0})
  await freezeSurveyContentSelections({} as never,'owner','project',[unit()],[s]);expect(mocks.get).toHaveBeenCalledTimes(1)
 })
 it.each(['RETIRED','REVOKED','SUPERSEDED'])('rejects %s at freeze time',async status=>{
  mocks.get.mockResolvedValue({...reference(),status});await expect(freezeSurveyContentSelections({} as never,'owner','project',[unit()],[selection()])).rejects.toMatchObject({statusCode:409})
 })
 it('rejects cross-project/owner scope and incompatible measurement',async()=>{
  for(const r of [{...reference(),scope:{...scope,resourceId:'other'}},{...reference(),scope:{...scope,ownerId:'other'}},{...reference(),content:{...reference().content,measurement:{releaseId:'other',contentHash:measurement.contentHash}}}]){
   mocks.get.mockResolvedValue(r);await expect(freezeSurveyContentSelections({} as never,'owner','project',[unit()],[selection()])).rejects.toMatchObject({statusCode:409})
  }
 })
 it('rejects foreign or duplicate instruments and reference entries',async()=>{
  const s=selection()
  for(const choices of [[s,s],[{...s,instrumentId:pid}],[{...s,references:[...s.references,...s.references]}],[{...s,references:[{...s.references[0],entryKey:'f'.repeat(64)}]}]]){
   await expect(freezeSurveyContentSelections({} as never,'owner','project',[unit()],choices)).rejects.toMatchObject({statusCode:409})
  }
 })
 it('does not create implicit report/reference selections',async()=>{
  const u=unit();await freezeSurveyContentSelections({} as never,'owner','project',[u],[]);expect(u.contentSelection).toBeUndefined();expect(mocks.get).not.toHaveBeenCalled()
 })
 it('rejects a mismatched report and FORM target',async()=>{
  mocks.get.mockImplementation(async(_tx,id)=>id===rid?reference():{...report(),family:'COGNITIVE'})
  await expect(freezeSurveyContentSelections({} as never,'owner','project',[unit()],[selection()])).rejects.toMatchObject({statusCode:409})
  await expect(freezeSurveyContentSelections({} as never,'owner','project',[{...unit(),kind:'FORM'}],[selection()])).rejects.toMatchObject({statusCode:409})
 })
})
it('Wave freeze locks current identity/grant/MFA and rechecks expiry after waiting',async()=>{
 const tx={$queryRaw:vi.fn().mockResolvedValue([{id:'project',status:'ACTIVE',collectionMode:'SINGLE_UNLINKED',expires_at:new Date(1000),checked_at:new Date(2000)}])}
 mocks.transaction.mockImplementation(async fn=>fn(tx))
 await expect(freezeResearchWaveDraft({actorUserId:'owner',projectId:'project',waveId:'wave',revision:0})).rejects.toMatchObject({statusCode:409})
 expect(tx.$queryRaw).toHaveBeenCalledTimes(1)
 const sql=tx.$queryRaw.mock.calls[0][0].join(' ? ')
 expect(sql).toContain('FOR UPDATE OF p FOR SHARE OF u,g,m');expect(sql).toContain('clock_timestamp() AS checked_at')
})
