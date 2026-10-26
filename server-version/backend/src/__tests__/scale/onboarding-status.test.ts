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
  if(sql.sql.includes('WITH registered')){
   const merged=new Map(rows.map(r=>[r.code+'@'+r.instrument_version,r]))
   for(const source of sources){const key=source.identity.instrumentKey+'@'+source.identity.instrumentVersion
    if(!merged.has(key))merged.set(key,{id:null,code:source.identity.instrumentKey,name:source.catalog.identity.canonicalName,instrument_version:source.identity.instrumentVersion,status:'NOT_INSTALLED',visibility:'HIDDEN',measurement_release_id:null} as never)}
   let selected=[...merged.values()].sort((a,b)=>a.code===b.code?(a.instrument_version<b.instrument_version?-1:1):a.code<b.code?-1:1)
   if(sql.sql.includes('ILIKE')){const q=String(sql.values[sources.length*3]).slice(1,-1).toLowerCase();selected=selected.filter(r=>[r.code,r.name,r.instrument_version].some(v=>v.toLowerCase().includes(q)))}
   if(sql.sql.includes('AND (code COLLATE')){const key=String(sql.values.at(-3)),version=String(sql.values.at(-2));selected=selected.filter(r=>r.code>key||r.code===key&&r.instrument_version>version)}
   return selected.slice(0,Number(sql.values.at(-1)))
  }
  if(sql.sql.includes('FROM survey_tool_policies'))return [{...identity,resource_key:identity.resourceKey,decision:sql.values[0]==='TRAINING'?'APPROVED':'RETURNED',paused:sql.values[0]==='TRAINING',version:1,reason:'synthetic exact-entry status'}]
  if(sql.sql.includes('FROM scale_deployment_policies'))return []
  throw new Error('Unexpected status query '+sql.sql)
 })
 return {db:{$queryRaw:query} as unknown as PrismaClient,query}
}
async function all(db:PrismaClient){const list=[];let cursor:string|undefined
 do{const page=await listStandardOnboardingStatus(db,{limit:50,...(cursor?{cursor}:{})});list.push(...page.list);cursor=page.nextCursor??undefined}while(cursor)
 return {list}
}
describe('onboarding status includes uninstalled exact versions without admission side effects',()=>{
 it('retains every registered version even when the database is empty and exposes next actions',async()=>{
  const {db,query}=database()
  const {list}=await all(db)
  expect(list).toHaveLength(sources.length)
  expect(new Set(list.map(r=>JSON.stringify([r.instrumentKey,r.instrumentVersion]))).size).toBe(sources.length)
  const registered=list.find(r=>r.instrumentKey===executable.identity.instrumentKey&&r.instrumentVersion===executable.identity.instrumentVersion)!
  expect(registered).toMatchObject({scaleId:null,allowActivation:false,stage:'已导入待部署',states:{imported:true,deployed:false,published:false,visible:false}})
  expect(registered.blockers).toContain('SCALE_NOT_INSTALLED')
  expect(registered.nextActions).toContainEqual(expect.objectContaining({code:'SCALE_NOT_INSTALLED',owner:'平台管理员'}))
  const candidate=sources.find(s=>!s.executable)!
  expect(list.find(r=>r.instrumentKey===candidate.identity.instrumentKey)).toMatchObject({stage:'仅目录候选',states:{imported:false,published:false}})
  expect(query.mock.calls.every(([q])=>/^(SELECT|WITH)\b/.test(q.sql.trimStart()))).toBe(true)
 })
 it('joins exact versions without duplicates, keeps source policies separate by entry and preserves pause',async()=>{
  const {db}=database([row()])
  const {list}=await all(db)
  expect(list).toHaveLength(sources.length)
  const installed=list.find(r=>r.scaleId==='installed')!
  expect(installed.states).toMatchObject({trainingEntry:'APPROVED',trainingEntryPaused:true,surveyEntry:'RETURNED',surveyEntryPaused:false,published:false,deployed:false})
  expect(installed.blockers).toContain('DEPLOYMENT_BINDING_MISSING')
  const older=row({id:'old',instrument_version:'unregistered-version',status:'PUBLISHED',visibility:'PUBLIC'})
  const oldView=(await all(database([older]).db)).list.find(r=>r.scaleId==='old')!
  expect(oldView).toMatchObject({stage:'已发布',states:{published:true,imported:false,trainingEntry:'PENDING',surveyEntry:'PENDING'}})
  expect(oldView.blockers).toContain('EXECUTABLE_SOURCE_MISSING')
 })
 it('bounds rows and deployment reads per page and rejects oversized/invalid requests before SQL',async()=>{
  const {db,query}=database([row(),row({id:'other',code:'z_old',instrument_version:'0'})])
  const page=await listStandardOnboardingStatus(db,{limit:2})
  expect(page.list).toHaveLength(2);expect(page.hasMore).toBe(true);expect(page.nextCursor).toBeTruthy()
  expect(query.mock.calls.filter(([q])=>q.sql.includes('FROM scale_deployment_policies'))).toHaveLength(1)
  expect(query.mock.calls.length).toBeLessThanOrEqual(4)
  expect(query.mock.calls[0][0].values.at(-1)).toBe(3)
  const count=query.mock.calls.length
  for(const input of [{limit:51},{limit:0},{cursor:'e30'},{query:'x'.repeat(161)}])await expect(listStandardOnboardingStatus(db,input)).rejects.toThrow()
  expect(query).toHaveBeenCalledTimes(count)
 })
})
