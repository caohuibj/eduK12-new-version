import {beforeEach,describe,expect,it,vi} from 'vitest'

const h=vi.hoisted(()=>({db:{} as any,sources:new Map<string,unknown>(),catalog:vi.fn(),media:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:(work:(db:unknown)=>unknown)=>work(h.db)}}))
vi.mock('../../modules/survey/catalog.service',()=>({
  catalogSnapshotsForDrafts:async()=>h.sources,compileCatalogUnit:h.catalog,
}))
vi.mock('../../modules/survey/media.references',()=>({assertSurveyMediaOwned:h.media}))

import {prepareRelease} from '../../modules/measurement-content/release'
import {compileFrozenResearchUnit,surveyMeasurementReleaseInput,surveyMeasurementPublicationMode,type ResearchFrozenUnit} from '../../modules/survey/publication.service'
import {preflightWave} from '../../modules/survey/waves.service'

function scaleDraft(){return {
  id:'draft',projectId:'project',kind:'SCALE',instrumentKey:'synthetic-effort',title:'合成投入量表',revision:2,
  status:'DRAFT',catalogGrantId:null as string|null,definition:{schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',
    responseOptions:[{optionKey:'low',label:'较少',score:1},{optionKey:'high',label:'较多',score:2}],
    dimensions:[{dimensionKey:'effort',label:'投入',direction:'descriptive'}],
    items:[{itemKey:'one',prompt:'愿意尝试',required:true,reverse:false,dimensionKeys:['effort']}]},
}}
const state={drafts:[] as any[],releases:[] as any[],denied:false,writes:[] as string[],reads:[] as string[]}
function stored(unit:ResearchFrozenUnit,owner='owner',project='project'){
  const p=prepareRelease(surveyMeasurementReleaseInput(unit,owner,project))
  return {id:'10000000-0000-4000-8000-000000000001',layer:p.layer,family:p.family,content_key:p.key,version:p.version,
    hash_scheme:p.hashScheme,content_hash:p.contentHash,content:p.content,scope:p.scope,provenance:p.provenance,
    asset_refs:p.assetRefs,source_release_id:p.sourceReleaseId,published_by:owner,published_at:new Date('2026-10-25T00:00:00Z'),status:'PUBLISHED'}
}
beforeEach(()=>{
  vi.clearAllMocks()
  state.drafts=[scaleDraft()];state.releases=[];state.denied=false;state.writes=[];state.reads=[]
  h.sources=new Map();h.media.mockResolvedValue([])
  const write=vi.fn(async()=>{state.writes.push('write');throw new Error('preflight must not write')})
  h.db={
    $queryRaw:vi.fn(async(query:any)=>{
      const sql=query.sql??query.join('?'),values=query.values??[];state.reads.push(sql)
      if(sql.includes('FROM "survey_projects"'))return state.denied?[]:[{id:'project',status:'DRAFT',collectionMode:'SINGLE_UNLINKED',expires_at:null,checked_at:new Date()}]
      if(sql.includes('FROM measurement_content_releases'))return state.releases.filter(r=>r.family===values[0]&&r.layer===values[1]&&r.content_key===values[2]&&r.version===values[3])
      if(/\b(INSERT|UPDATE|DELETE)\b/.test(sql))state.writes.push(sql)
      throw new Error('Unexpected query: '+sql)
    }),
    $executeRaw:write,
    surveyWave:{findFirst:vi.fn(async()=>({id:'wave',projectId:'project',revision:4,status:'DRAFT',instrumentIds:state.drafts.map(d=>d.id),consentText:'合成研究说明和知情同意，仅用于离线代码合同测试。'}))},
    surveyInstrumentDraft:{findMany:vi.fn(async()=>state.drafts),update:write},
    surveyPublication:{create:write},
  }
})
const run=()=>preflightWave('owner','project','wave')

describe('read-only wave preflight and exact measurement publication',()=>{
  it('reports the missing explicit publication before freeze without creating one',async()=>{
    const result=await run()
    expect(result.ok).toBe(false)
    expect(result.checks).toContainEqual({key:'draft:measurement',ok:false,issues:['合成投入量表（修订 2）：请先显式发布当前修订的测量版本，再冻结波次']})
    expect(state.releases).toEqual([]);expect(state.writes).toEqual([])
  })
  it('accepts the exact current published release and exposes its digest without writes',async()=>{
    const release=stored(compileFrozenResearchUnit(state.drafts[0]));state.releases=[release]
    const result=await run()
    expect(result.ok).toBe(true)
    expect(result.checks).toContainEqual({key:'draft:measurement',ok:true,issues:[],digest:release.content_hash})
    expect(state.reads.find(sql=>sql.includes('FROM measurement_content_releases'))).toContain('FOR SHARE')
    expect(state.writes).toEqual([])
  })
  it.each(['revision','owner','project','content'])('rejects a published release with another %s',async field=>{
    const prior=structuredClone(state.drafts[0])
    if(field==='revision')prior.revision--
    if(field==='content')prior.definition.items[0].prompt='另一个正文'
    state.releases=[stored(compileFrozenResearchUnit(prior),field==='owner'?'other':'owner',field==='project'?'other-project':'project')]
    const result=await run()
    expect(result.ok).toBe(false)
    expect(result.checks.find(c=>c.key==='draft:measurement')).toMatchObject({ok:false})
    expect(state.writes).toEqual([])
  })
  it.each(['REVOKED','RETIRED','SUPERSEDED'])('reports %s without republishing or reactivating it',async status=>{
    state.releases=[{...stored(compileFrozenResearchUnit(state.drafts[0])),status}]
    const before=structuredClone(state.releases)
    expect((await run()).ok).toBe(false)
    expect(state.releases).toEqual(before);expect(state.writes).toEqual([])
  })
  it('keeps structural draft errors local and does not label them missing publication',async()=>{
    state.drafts[0].definition.items=[]
    const result=await run()
    expect(result.ok).toBe(false)
    expect(result.checks.find(c=>c.key==='draft')).toMatchObject({ok:false})
    expect(result.checks.some(c=>c.key.endsWith(':measurement'))).toBe(false)
    expect(state.reads.some(sql=>sql.includes('measurement_content_releases'))).toBe(false)
  })
  it('does not require a measurement release for an ordinary FORM',async()=>{
    state.drafts=[{...scaleDraft(),kind:'FORM',definition:{schemaVersion:1,pages:[{pageKey:'one',title:'背景',questions:[{itemKey:'text',type:'SHORT_TEXT',prompt:'可选留言',required:false,maxLength:100}]}]}}]
    const result=await run()
    expect(result.ok).toBe(true)
    expect(result.checks.some(c=>c.key.endsWith(':measurement'))).toBe(false)
    expect(state.reads.some(sql=>sql.includes('measurement_content_releases'))).toBe(false)
    expect(state.writes).toEqual([])
  })
  it('checks catalog SCALE explicit publication and does not treat source ONLINE as project publication',async()=>{
    state.drafts[0].catalogGrantId='grant'
    const unit={...compileFrozenResearchUnit(state.drafts[0]),sourceProvenance:{source:{sourceVersion:'1.0.0'},surveyStandardReleaseId:'online-standard',sourceMeasurementRelease:{releaseId:'20000000-0000-4000-8000-000000000001'}}}
    h.catalog.mockReturnValue(unit);h.sources.set('grant',{})
    expect((await run()).ok).toBe(false)
    state.releases=[stored(unit)]
    expect((await run()).ok).toBe(true)
    expect(state.writes).toEqual([])
  })
  it('does not add an explicit step for catalog package measurements migrated at freeze',async()=>{
    state.drafts[0].catalogGrantId='package-grant'
    const unit={...compileFrozenResearchUnit(state.drafts[0]),sourceProvenance:{surveyPackage:{importId:'package'}}}
    h.catalog.mockReturnValue(unit);h.sources.set('package-grant',{})
    expect((await run()).ok).toBe(true)
    expect(state.reads.some(sql=>sql.includes('measurement_content_releases'))).toBe(false)
    expect(state.writes).toEqual([])
  })
  it('reports every missing current publication in a mixed selection',async()=>{
    state.drafts.push({...scaleDraft(),id:'second',instrumentKey:'second'})
    const result=await run()
    expect(result.ok).toBe(false)
    expect(result.checks.filter(c=>c.key.endsWith(':measurement'))).toHaveLength(2)
    expect(state.writes).toEqual([])
  })
  it('does not query publication identities for an unauthorized project',async()=>{
    state.denied=true
    await expect(run()).rejects.toMatchObject({statusCode:404})
    expect(h.db.surveyInstrumentDraft.findMany).not.toHaveBeenCalled()
    expect(state.reads.some(sql=>sql.includes('measurement_content_releases'))).toBe(false)
  })
  it('does not convert a database outage into a missing-publication instruction',async()=>{
    h.db.$queryRaw.mockImplementation(async(query:any)=>{
      const sql=query.sql??query.join('?')
      if(sql.includes('FROM "survey_projects"'))return [{id:'project',status:'DRAFT',collectionMode:'SINGLE_UNLINKED',expires_at:null,checked_at:new Date()}]
      throw new Error('database unavailable')
    })
    await expect(run()).rejects.toThrow('database unavailable')
  })
})

describe('one publication mode for preflight and freeze',()=>{
  it.each([
    ['FORM',undefined,'NONE'],['SCALE',undefined,'EXPLICIT'],['COGNITIVE',undefined,'EXPLICIT'],['SJT',undefined,'EXPLICIT'],
    ['SCALE',{surveyStandardReleaseId:'online'},'EXPLICIT'],['SCALE',{surveyPackage:{}},'AT_FREEZE'],
    ['SJT',{},'AT_FREEZE'],['COGNITIVE',{},'AT_FREEZE'],['FORM',{surveyPackage:{}},'NONE'],
  ] as const)('%s with %j uses %s',(kind,sourceProvenance,expected)=>{
    expect(surveyMeasurementPublicationMode({kind,sourceProvenance})).toBe(expected)
  })
})
