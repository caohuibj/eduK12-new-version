import {beforeEach,describe,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({transaction:vi.fn(),authorize:vi.fn(),catalog:vi.fn(),catalogCompile:vi.fn(),recheck:vi.fn(),compile:vi.fn(),resolve:vi.fn(),batch:vi.fn(),query:vi.fn(),wave:vi.fn(),draft:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:m.transaction}}))
vi.mock('../../modules/survey/builder.service',()=>({authorizedProject:m.authorize,SurveyBuilderError:class extends Error{}}))
vi.mock('../../modules/survey/catalog.service',()=>({catalogSnapshotsForDrafts:m.catalog,compileCatalogUnit:m.catalogCompile}))
vi.mock('../../modules/survey/catalog.sources',()=>({recheckCatalogScaleSourceExpiry:m.recheck}))
vi.mock('../../modules/survey/publication.service',()=>({compileFrozenResearchUnit:m.compile,resolveSurveyMeasurementUnit:m.resolve}))
vi.mock('../../modules/measurement-content/repository',()=>({getContentReleaseBatch:m.batch,getContentRelease:vi.fn()}))
import {listSurveyContentOptions,surveyContentOptionsQuerySchema} from '../../modules/survey/content-options.service'
import {referenceEntryKey} from '../../modules/measurement-content/reference-candidate'
const iid='11111111-1111-4111-8111-111111111111',rid='22222222-2222-4222-8222-222222222222'
const measurement={releaseId:'measurement',contentHash:'a'.repeat(64),version:'3',content:{measurementHash:'b'.repeat(64)}}
const scope={kind:'PRIVATE',ownerId:'owner',product:'SURVEY',resourceId:'project'}
const pointer={releaseId:measurement.releaseId,contentHash:measurement.contentHash}
const entry={instrumentVersion:'1',scoringVersion:'1',scoreKey:'total',referenceKind:'descriptive_sample',population:{description:'研究样本'},statistics:{mean:12345},source:{citation:'Private study'}}
const report=()=>({releaseId:rid,key:'report:one',version:'1',contentHash:'c'.repeat(64),status:'PUBLISHED',scope,family:'SCALE',layer:'REPORT',content:{measurements:[pointer],template:{title:'报告标题',blocks:[{secret:'private text'}]},audience:'researcher',language:'zh-CN',metricKeys:['total']}})
const reference=()=>({...report(),layer:'REFERENCE',content:{measurement:pointer,entries:[{metricKey:'total',referenceKind:'descriptive_sample',definition:entry}]}})
const query=(layer:'REPORT'|'REFERENCE'='REPORT',page=1)=>({instrumentId:iid,layer,page})
const tx={$queryRaw:m.query,surveyWave:{findFirst:m.wave},surveyInstrumentDraft:{findFirst:m.draft}}
beforeEach(()=>{
 vi.clearAllMocks();m.transaction.mockImplementation(fn=>fn(tx));m.authorize.mockResolvedValue({id:'project',status:'ACTIVE'})
 m.query.mockReset().mockResolvedValue([{id:rid}])
 m.wave.mockResolvedValue({id:'wave',status:'DRAFT',publicationId:null,instrumentIds:[iid],revision:4})
 m.draft.mockResolvedValue({id:iid,projectId:'project',kind:'SCALE',instrumentKey:'scale',title:'量表',revision:3,status:'DRAFT',catalogGrantId:null})
 m.catalog.mockResolvedValue(new Map());m.recheck.mockResolvedValue(undefined)
 m.compile.mockImplementation(draft=>({draftId:draft.id,kind:draft.kind,instrumentKey:draft.instrumentKey,draftRevision:draft.revision}))
 m.resolve.mockResolvedValue(measurement);m.batch.mockResolvedValue(new Map([[rid,report()]]))
})
describe('private Survey Wave content options',()=>{
 it('returns exact metadata, not template content, with shared scope and a bounded query',async()=>{
  const result=await listSurveyContentOptions('owner','project','wave',query())
  expect(result).toMatchObject({instrumentId:iid,draftRevision:3,waveRevision:4,measurement:pointer,pageSize:25,hasMore:false,options:[{releaseId:rid,audience:'researcher',title:'报告标题'}]})
  expect(JSON.stringify(result)).not.toMatch(/private text|blocks|compiledDefinition/)
  expect(m.authorize).toHaveBeenCalledTimes(2);expect(m.resolve).toHaveBeenCalledWith(tx,expect.objectContaining({draftRevision:3}),'owner','project')
  expect(m.batch).toHaveBeenCalledWith(tx,[rid])
  const sql=m.query.mock.calls[0][0];expect(sql.sql).toContain("scope->>'ownerId'=");expect(sql.sql).toContain("scope->>'kind'='PRIVATE'")
  expect(sql.sql).toContain("content->'measurements'=");expect(sql.sql).toContain('ORDER BY published_at DESC,id LIMIT');expect(sql.sql).not.toContain('FOR SHARE');expect(m.query).toHaveBeenCalledTimes(1)
  expect(sql.values).toContain('owner');expect(sql.values).toContain(26);expect(sql.values).toContain(0)
 })
 it('returns exact reference entry keys and population without statistics or sample membership',async()=>{
  m.batch.mockResolvedValue(new Map([[rid,reference()]]))
  const result=await listSurveyContentOptions('owner','project','wave',query('REFERENCE'))
  expect(result.options[0]).toMatchObject({entries:[{entryKey:referenceEntryKey(entry as any),metricKey:'total',population:{description:'研究样本'}}]})
  expect(JSON.stringify(result)).not.toMatch(/12345|statistics|Private study|sampleManifest/)
 })
 it('checks owner before reads and rechecks expiry after waits',async()=>{
  m.authorize.mockRejectedValueOnce(new Error('not owner'))
  await expect(listSurveyContentOptions('other','project','wave',query())).rejects.toThrow('not owner')
  expect(m.query).not.toHaveBeenCalled();expect(m.wave).not.toHaveBeenCalled()
  m.authorize.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('expired'))
  await expect(listSurveyContentOptions('owner','project','wave',query())).rejects.toThrow('expired')
 })
 it.each([{status:'ACTIVE'},{publicationId:'existing'},{instrumentIds:[]}])('rejects unavailable Wave %j',async change=>{
  m.wave.mockResolvedValue({status:'DRAFT',publicationId:null,instrumentIds:[iid],...change})
  await expect(listSurveyContentOptions('owner','project','wave',query())).rejects.toMatchObject({statusCode:409});expect(m.resolve).not.toHaveBeenCalled()
 })
 it('does not publish a missing current revision',async()=>{
  m.resolve.mockRejectedValueOnce(new Error('请先显式发布当前修订'))
  await expect(listSurveyContentOptions('owner','project','wave',query())).rejects.toThrow('请先显式发布当前修订');expect(m.batch).not.toHaveBeenCalled()
 })
 it('rejects FORM selection before resolving content',async()=>{
  m.draft.mockResolvedValue({kind:'FORM'})
  await expect(listSurveyContentOptions('owner','project','wave',query())).rejects.toMatchObject({statusCode:409});expect(m.resolve).not.toHaveBeenCalled()
 })
 it.each(['REVOKED','RETIRED','SUPERSEDED'])('rejects %s changed after index lookup',async status=>{
  m.batch.mockResolvedValue(new Map([[rid,{...report(),status}]]))
  await expect(listSurveyContentOptions('owner','project','wave',query())).rejects.toMatchObject({statusCode:409})
 })
 it.each([{kind:'PLATFORM'}, {...scope,ownerId:'other'}, {...scope,resourceId:'other'}, {...scope,product:'TRAINING'}])('never expands scope %j',async badScope=>{
  m.batch.mockResolvedValue(new Map([[rid,{...report(),scope:badScope}]]))
  await expect(listSurveyContentOptions('owner','project','wave',query())).rejects.toMatchObject({statusCode:409})
 })
 it('rejects incompatible measurement after verified release read',async()=>{
  m.batch.mockResolvedValue(new Map([[rid,{...report(),content:{...report().content,measurements:[{...pointer,contentHash:'d'.repeat(64)}]}}]]))
  await expect(listSurveyContentOptions('owner','project','wave',query())).rejects.toMatchObject({statusCode:409})
 })
 it('paginates releases with explicit hasMore',async()=>{
  const rows=Array.from({length:26},(_,i)=>({id:String(i)}))
  m.query.mockReset().mockResolvedValueOnce(rows)
  m.batch.mockResolvedValue(new Map(rows.map(row=>[row.id,{...report(),releaseId:row.id}])))
  const result=await listSurveyContentOptions('owner','project','wave',query('REPORT',2))
  expect(result.options).toHaveLength(25);expect(result.hasMore).toBe(true);expect(m.query.mock.calls[0][0].values).toContain(25)
 })
 it('uses existing licensed catalog checks for read-only sources',async()=>{
  const draft={id:iid,kind:'SCALE',instrumentKey:'source',revision:1,catalogGrantId:'grant'}
  m.draft.mockResolvedValue(draft);m.catalog.mockResolvedValue(new Map([['grant',{source:'verified'}]]));m.catalogCompile.mockReturnValue({draftId:iid,kind:'SCALE'})
  await listSurveyContentOptions('owner','project','wave',query())
  expect(m.catalog).toHaveBeenCalledWith(tx,'owner',['grant']);expect(m.compile).not.toHaveBeenCalled();expect(m.recheck).toHaveBeenCalled()
 })
 it('validates pagination and prohibits caller-defined scope',()=>{
  for(const value of [{...query(),page:0},{...query(),page:1001},{...query(),layer:'MEASUREMENT'},{...query(),actorId:'other'}])expect(()=>surveyContentOptionsQuerySchema.parse(value)).toThrow()
 })
})
