import {describe,it,expect,vi} from 'vitest'
import {prepareRelease} from '../../modules/measurement-content/release'
import {requirePublishedContentRelease} from '../../modules/measurement-content/repository'
const input=()=>({family:'SCALE',layer:'MEASUREMENT',key:'scope:scale',version:'1',scope:{kind:'PRIVATE',ownerId:'owner',product:'SURVEY',resourceId:'project'},assetRefs:[],sourceReleaseId:null,
 content:{projectionVersion:1,instrumentVersion:'1',measurementHash:'a'.repeat(64),measurementHashScheme:'SCALE_MEASUREMENT_PROJECTION_V1',scoringVersion:'1',runnerKey:'scale',runnerVersion:'2',locale:'und',localizationVersion:'1',metrics:[{metricKey:'total',unit:'points',direction:'descriptive'}],executable:{items:[]}}})
const row=()=>{const x=prepareRelease(input());return {id:'release',family:x.family,layer:x.layer,content_key:x.key,version:x.version,hash_scheme:x.hashScheme,content_hash:x.contentHash,content:x.content,scope:x.scope,provenance:x.provenance,asset_refs:x.assetRefs,source_release_id:x.sourceReleaseId,published_by:'owner',published_at:new Date(),status:'PUBLISHED'}}
describe('admission requires an existing locked exact release',()=>{
 it('locks and resolves without creating or updating content',async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([row()]),$executeRaw:vi.fn()}
  expect((await requirePublishedContentRelease(db as never,input())).releaseId).toBe('release')
  expect(db.$queryRaw.mock.calls[0][0].sql).toContain('FOR SHARE');expect(db.$executeRaw).not.toHaveBeenCalled()
 })
 it('rejects missing content instead of publishing during freeze',async()=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()}
  await expect(requirePublishedContentRelease(db as never,input())).rejects.toThrow('CONTENT_RELEASE_NOT_PUBLISHED')
  expect(db.$executeRaw).not.toHaveBeenCalled()
 })
 it.each(['SUPERSEDED','RETIRED','REVOKED'])('rejects %s current state after lock',async status=>{
  const db={$queryRaw:vi.fn().mockResolvedValue([{...row(),status}])}
  await expect(requirePublishedContentRelease(db as never,input())).rejects.toThrow('CONTENT_RELEASE_NOT_AVAILABLE_FOR_ADMINISTRATION')
 })
 it('rejects scientific, provenance and scope mismatches under the same key/version',async()=>{
  for(const changed of [{...row(),content_hash:'b'.repeat(64)},{...row(),provenance:{changed:true}},{...row(),scope:{kind:'PLATFORM'}}]){
   const db={$queryRaw:vi.fn().mockResolvedValue([changed])}
   await expect(requirePublishedContentRelease(db as never,input())).rejects.toThrow('CONTENT_VERSION_IMMUTABLE')
  }
 })
})

it('Survey native freeze reports a controlled conflict when its exact revision was not published',async()=>{
  const {compileFrozenResearchUnit,resolveSurveyMeasurementUnit}=await import('../../modules/survey/publication.service')
  const unit=compileFrozenResearchUnit({id:'draft',instrumentKey:'scale',kind:'SCALE',title:'Scale',revision:2,definition:{schemaVersion:1,
    respondentType:'participant_self_report',aggregation:'sum',responseOptions:[{optionKey:'a',label:'A',score:1},{optionKey:'b',label:'B',score:2}],
    dimensions:[{dimensionKey:'total',label:'Total',direction:'descriptive'}],items:[{itemKey:'one',prompt:'Item',required:true,reverse:false,dimensionKeys:['total']}]}})
  const db={$queryRaw:vi.fn().mockResolvedValue([]),$executeRaw:vi.fn()}
  await expect(resolveSurveyMeasurementUnit(db as never,unit,'owner','project')).rejects.toMatchObject({statusCode:409,message:'请先显式发布当前修订的测量版本，再冻结波次'})
  expect(db.$executeRaw).not.toHaveBeenCalled()
})
