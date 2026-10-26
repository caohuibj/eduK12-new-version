import {describe,expect,it,vi} from 'vitest'
import {Prisma,type PrismaClient} from '@prisma/client'
import {listStandardOnboardingStatus} from '../../modules/scale/onboarding/status'
import {listScaleInstrumentSources} from '../../modules/scale/onboarding/instrument-registry'
import {scaleSourcePolicyIdentity} from '../../modules/scale/onboarding/source-snapshot'

const sources=listScaleInstrumentSources()
const executable=sources.find(source=>source.executable)!
const identity=scaleSourcePolicyIdentity(executable)
type Row={id:string;code:string;name:string;instrument_version:string;status:string;visibility:string;measurement_release_id:string|null}
const row=(over:Partial<Row>={}):Row=>({id:'installed',code:executable.identity.instrumentKey,name:'已安装测试工具',instrument_version:executable.identity.instrumentVersion,status:'DRAFT',visibility:'HIDDEN',measurement_release_id:null,...over})
function database(rows:Row[]=[]){
 const query=vi.fn(async(sql:Prisma.Sql)=>{
  if(sql.sql.includes('FROM scales '))return rows
  if(sql.sql.includes('FROM survey_tool_policies'))return [{...identity,resource_key:identity.resourceKey,decision:sql.values[0]==='TRAINING'?'APPROVED':'RETURNED',paused:sql.values[0]==='TRAINING',version:1,reason:'synthetic exact-entry status'}]
  if(sql.sql.includes('FROM "scale_deployment_policies"'))return []
  throw new Error('Unexpected status query '+sql.sql)
 })
 return {db:{$queryRaw:query} as unknown as PrismaClient,query}
}
describe('onboarding status includes uninstalled exact versions without admission side effects',()=>{
 it('retains every registered version even when the database is empty and exposes next actions',async()=>{
  const {db,query}=database()
  const {list}=await listStandardOnboardingStatus(db)
  expect(list).toHaveLength(sources.length)
  expect(new Set(list.map(r=>JSON.stringify([r.instrumentKey,r.instrumentVersion]))).size).toBe(sources.length)
  const registered=list.find(r=>r.instrumentKey===executable.identity.instrumentKey&&r.instrumentVersion===executable.identity.instrumentVersion)!
  expect(registered).toMatchObject({scaleId:null,allowActivation:false,stage:'已导入待部署',states:{imported:true,deployed:false,published:false,visible:false}})
  expect(registered.blockers).toContain('SCALE_NOT_INSTALLED')
  expect(registered.nextActions).toContainEqual(expect.objectContaining({code:'SCALE_NOT_INSTALLED',owner:'平台管理员'}))
  const candidate=sources.find(s=>!s.executable)!
  expect(list.find(r=>r.instrumentKey===candidate.identity.instrumentKey)).toMatchObject({stage:'仅目录候选',states:{imported:false,published:false}})
  expect(query.mock.calls.every(([q])=>q.sql.trimStart().startsWith('SELECT'))).toBe(true)
 })
 it('joins exact versions without duplicates, keeps source policies separate by entry and preserves pause',async()=>{
  const {db}=database([row()])
  const {list}=await listStandardOnboardingStatus(db)
  expect(list).toHaveLength(sources.length)
  const installed=list.find(r=>r.scaleId==='installed')!
  expect(installed.states).toMatchObject({trainingEntry:'APPROVED',trainingEntryPaused:true,surveyEntry:'RETURNED',surveyEntryPaused:false,published:false,deployed:false})
  expect(installed.blockers).toContain('DEPLOYMENT_BINDING_MISSING')
  const older=row({id:'old',instrument_version:'unregistered-version',status:'PUBLISHED',visibility:'PUBLIC'})
  const oldView=(await listStandardOnboardingStatus(database([older]).db)).list.find(r=>r.scaleId==='old')!
  expect(oldView).toMatchObject({stage:'已发布',states:{published:true,imported:false,trainingEntry:'PENDING',surveyEntry:'PENDING'}})
  expect(oldView.blockers).toContain('EXECUTABLE_SOURCE_MISSING')
 })
})
