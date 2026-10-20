import {beforeEach,describe,expect,it,vi} from 'vitest'
const read=vi.hoisted(()=>vi.fn())
vi.mock('../../modules/measurement-content/repository',()=>({getContentRelease:read}))
import {attachTrainingReportSelection,trainingReportSelectionSchema,validateTrainingReportPointer} from '../../modules/composite/training-report-selection'
import {prepareRelease} from '../../modules/measurement-content/release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const itemId='11111111-1111-4111-8111-111111111111',mid='22222222-2222-4222-8222-222222222222',rid='33333333-3333-4333-8333-333333333333'
const unit:any={itemId,family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'source'},measurement:{releaseId:mid,contentHash:'a'.repeat(64),measurementHash:'b'.repeat(64)}}
const measurement:any={layer:'MEASUREMENT',contentHash:'a'.repeat(64),content:{metrics:[{metricKey:'effort'}]}}
const report=()=>({...prepareRelease({layer:'REPORT',family:'SCALE',key:'report',version:'1',scope:{kind:'PRIVATE',product:'TRAINING',ownerId:'teacher',resourceId:'composite'},assetRefs:[],sourceReleaseId:null,content:{projectionVersion:1,measurements:[{releaseId:mid,contentHash:'a'.repeat(64)}],metricKeys:['effort'],audience:'teacher',language:'zh-CN',generatorVersion:'declarative-report-v1',template:{blocks:[{type:'METRIC',metricKey:'effort',display:'RAW'}],limitations:[]}}}),releaseId:rid,status:'PUBLISHED'})
const input=()=>({snapshot:{schemaVersion:1 as const,compositeId:'composite',units:[unit]},releases:new Map<string,any>([[mid,measurement]]),ownerId:'teacher',selection:{schemaVersion:1,units:[{itemId,reportReleaseId:rid}]}})
beforeEach(()=>{read.mockReset();read.mockResolvedValue(report())})
describe('Training owner report selection',()=>{
 it('pins compact exact report identity and recomputes publication hash',async()=>{
  const result=await attachTrainingReportSelection({} as never,input())
  expect(result.snapshot.units[0].report).toEqual({releaseId:rid,contentHash:report().contentHash})
  expect(result.snapshotHash).toBe(canonicalHash(result.snapshot));expect(read).toHaveBeenCalledTimes(1)
 })
 it('keeps null selection unchanged and rejects duplicates/unknown items',async()=>{
  const value=input();expect((await attachTrainingReportSelection({} as never,{...value,selection:null})).snapshot).toBe(value.snapshot)
  expect(()=>trainingReportSelectionSchema.parse({schemaVersion:1,units:[...value.selection.units,...value.selection.units]})).toThrow()
  await expect(attachTrainingReportSelection({} as never,{...value,selection:{schemaVersion:1,units:[{itemId:rid,reportReleaseId:rid}]}})).rejects.toThrow('SELECTION_INVALID')
 })
 it.each([{ownerId:'other'},{product:'SURVEY'},{resourceId:'other'},{kind:'SHARED'}])('rejects foreign scope %j',async change=>{
  const row=report();read.mockResolvedValue({...row,scope:{...row.scope,...change}})
  await expect(attachTrainingReportSelection({} as never,input())).rejects.toThrow('SELECTION_INVALID')
 })
 it.each(['RETIRED','SUPERSEDED','REVOKED'])('new publication rejects %s; START keeps exact pointer without blocking raw',async status=>{
  const row={...report(),status};read.mockResolvedValue(row)
  await expect(attachTrainingReportSelection({} as never,input())).rejects.toThrow('SELECTION_INVALID')
  await expect(validateTrainingReportPointer({} as never,{unit,compositeId:'composite',ownerId:'teacher',reportReleaseId:rid,contentHash:row.contentHash,publication:false,releases:input().releases})).resolves.toEqual({releaseId:rid,contentHash:row.contentHash})
 })
 it('rejects hash, family, measurement and metric mismatches',async()=>{
  for(const row of [{...report(),contentHash:'c'.repeat(64)},{...report(),family:'SJT'},{...report(),content:{...report().content,measurements:[{releaseId:rid,contentHash:'a'.repeat(64)}]}}]){
   read.mockResolvedValue(row);await expect(attachTrainingReportSelection({} as never,input())).rejects.toThrow()
  }
  read.mockResolvedValue(report());const value=input();value.releases.set(mid,{...measurement,content:{metrics:[]}})
  await expect(attachTrainingReportSelection({} as never,value)).rejects.toThrow('SELECTION_INVALID')
 })
})
