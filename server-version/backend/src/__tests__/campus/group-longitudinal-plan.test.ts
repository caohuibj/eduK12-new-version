import {beforeEach,describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const m=vi.hoisted(()=>({query:vi.fn(),composites:vi.fn(),transaction:vi.fn(),manager:vi.fn(),catalog:vi.fn(),generate:vi.fn(),read:vi.fn(),record:vi.fn(),spec:vi.fn(),review:vi.fn(),save:vi.fn(),readSaved:vi.fn(),list:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$queryRaw:m.query,$transaction:m.transaction,compositeAssessment:{findMany:m.composites}}}))
vi.mock('../../modules/campus/group-reports',()=>({requireCampusGroupManager:m.manager,generateCampusGroupReport:m.generate,readCampusGroupReport:m.read,assertReviewedCampusGroupSpec:m.review}))
vi.mock('../../modules/reporting/resultSource',()=>({listAuthoritativeRunLeafSources:m.catalog}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:m.spec}))
vi.mock('../../modules/reporting/artifact',()=>({readReportingArtifactRecord:m.record}))
vi.mock('../../modules/reporting/task-artifact',()=>({saveTaskGroupLongitudinalArtifact:m.save,readTaskGroupLongitudinalArtifact:m.readSaved,listTaskGroupLongitudinalArtifacts:m.list,listTaskGroupLongitudinalArtifactsPage:async(...args:unknown[])=>({artifacts:await m.list(...args),nextCursor:null})}))
import {generateSchoolPlanGroup,readSchoolPlanGroup,schoolPlanGroupCatalog,schoolPlanLeafBinding} from '../../modules/campus/group-longitudinal-plan.service'
const digest='a'.repeat(64),metric={id:'stable-A',sourceKey:'track1:item-A',scoreKey:'score',label:'A',unit:'score',measurementHash:digest,kind:'SCALE' as const}
const plan={schemaVersion:1,id:randomUUID(),baselineWaveId:'wave1',metrics:[metric]}
const scope={actor:{userId:'manager',role:'ADMIN',accountDomain:'SCHOOL'} as any,organizationId:'school',runId:'wave1'}
const input={...scope,planId:plan.id,sourceKey:metric.sourceKey,throughWaveId:'wave2',specId:'existing-GROUP',selection:{kind:'CLASSES' as const,ids:['class-A']}}
let safe:Record<string,any>,records:Record<string,any>,stored:any,headers:any[]
beforeEach(()=>{
 vi.resetAllMocks();stored=undefined
 const waves=[1,2].map(i=>({id:'wave'+i,ordinal:i,name:'T'+i,tracking:{schemaVersion:1,entry:'SCHOOL',bindings:[{metricId:metric.id,trackId:'track'+i,itemId:'item-A',scoreKey:'score',visible:false}],...(i===1?{plan}:{})}}))
 const snapshot={schemaVersion:1,compositeId:'frozen-tool',units:[{itemId:'item-A',family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'owner'},measurement:{releaseId:randomUUID(),contentHash:digest,measurementHash:digest}}]}
 const policy={runtimeLaunchTarget:{kind:'COMPOSITE',ref:'frozen-tool'}}
 headers=[1,2].map(i=>({executionId:'execution'+i,runId:'wave'+i,trackId:'track'+i,subjectId:'person'+i,attemptId:'parent'+i,epoch:1,completedAt:new Date('2026-09-0'+i+'T12:00:00Z'),latest:true}))
 m.query.mockImplementation((q:any)=>{const sql=(Array.isArray(q)?q:q.strings).join(' ');if(sql.includes('SELECT run.personal_tracking_baseline_id'))return[{baselineId:'wave1',tracking:waves[0].tracking}];if(sql.includes('SELECT run.id,run.personal_tracking_ordinal'))return waves;if(sql.includes('FROM assessment_run_tracks'))return waves.map((w,i)=>({id:'track'+(i+1),runId:w.id,policy,policyHash:canonicalHash(policy)}));if(sql.includes('JOIN composite_assessment_attempts'))return headers;throw Error('Unexpected query '+sql)})
 m.transaction.mockImplementation((fn:any)=>fn({}));m.manager.mockResolvedValue({userId:'manager',groupAudience:'ORGANIZATION'});m.list.mockResolvedValue([])
 m.composites.mockResolvedValue([{id:snapshot.compositeId,trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot),items:[{id:'item-A'}]}])
 m.spec.mockResolvedValue({definition:{analysisKind:'GROUP',minimumCohortN:10,minimumContributorN:10,metricRules:[{metricId:'published-score',sourceMetricKey:'score',minimumMetricN:10}]}})
 safe={};records={}
 for(const i of [1,2]){
  const leaf={slotKey:'scale:item-A',unitType:'SCALE',instrumentKey:'A',instrumentVersion:'1',compiledRuntimeHash:String(i).repeat(64)}
  const projection={schemaVersion:1,title:'school',populationLabel:'冻结班级'+i,cutoff:'2026-10-30T00:00:00Z',completedN:10,countUnit:'PERSON',metrics:[{key:'published-score',type:'NUMBER',unit:'score',state:'present',validN:10,missingN:0,mean:i,sdSample:0}],limitations:['frozen School policy']}
  safe['artifact'+i]={artifactId:'artifact'+i,generatedAt:'2026-10-30T00:00:00Z',projection}
  records['artifact'+i]={id:'artifact'+i,organizationId:'school',snapshotHash:'saved'+i,analysisKind:'GROUP',artifactPayload:{schemaVersion:2,source:{runId:'wave'+i,trackId:'track'+i,leaf},inputManifest:[{executionId:'execution'+i,subjectUserId:'person'+i}]}}
 }
 m.catalog.mockImplementation(({runId}:any)=>[{leaf:records['artifact'+runId.slice(-1)].artifactPayload.source.leaf,metrics:[{key:'score',unit:'score'}]}])
 m.generate.mockImplementation(({runId}:any)=>safe['artifact'+runId.slice(-1)]);m.read.mockImplementation(({artifactId}:any)=>safe[artifactId]);m.record.mockImplementation((id:string)=>records[id])
 m.save.mockImplementation((_tx:any,value:any)=>{stored={...value,artifactId:'combined',generatedAt:'2026-10-30T00:00:00Z'};return{artifactId:stored.artifactId,generatedAt:stored.generatedAt,projection:stored.projection}});m.readSaved.mockImplementation(()=>stored)
})
describe('School plan thin adapter delegates disclosure and reuses group snapshots',()=>{
 it('maps stable plan leafs independently of participant visibility and freezes actual times; old read never rediscovers or scores',async()=>{
  const result=await generateSchoolPlanGroup(input)
  expect(result.projection.metrics[0].points.map(p=>[p.mean,p.baselineDelta,p.observedFrom])).toEqual([[1,null,'2026-09-01T12:00:00.000Z'],[2,1,'2026-09-02T12:00:00.000Z']])
  expect(result.projection.wavePopulationLabels).toEqual({wave1:'冻结班级1',wave2:'冻结班级2'})
  expect(result.projection.metrics[0].points[1].populationChanged).toBe(true)
  expect(m.generate).toHaveBeenCalledWith(expect.objectContaining({runId:'wave2',trackId:'track2',selection:input.selection,specId:input.specId}))
  expect(m.catalog).toHaveBeenCalledWith(expect.objectContaining({slotKey:'scale:item-A',groupAudience:'ORGANIZATION'}))
  expect(m.save.mock.calls[0][1].source.product).toBe('SCHOOL');expect(stored.sourceBindings.waves[0]).not.toHaveProperty('projection')
  m.catalog.mockClear();m.generate.mockClear();m.composites.mockClear()
  expect(await readSchoolPlanGroup({...scope,artifactId:'combined'})).toEqual(result)
  expect(m.read).toHaveBeenCalledTimes(2);expect(m.generate).not.toHaveBeenCalled();expect(m.catalog).not.toHaveBeenCalled();expect(m.composites).not.toHaveBeenCalled()
 })
 it('refuses lost manager authority, a narrowed prior public view, and a stale execution pointer instead of falling back',async()=>{
  m.manager.mockRejectedValueOnce(new Error('manager denied'));await expect(schoolPlanGroupCatalog(scope)).rejects.toThrow('manager denied');expect(m.query).not.toHaveBeenCalled()
  await generateSchoolPlanGroup(input)
  m.read.mockImplementation(({artifactId}:any)=>({...safe[artifactId],projection:{...safe[artifactId].projection,completedN:null}}))
  await expect(readSchoolPlanGroup({...scope,artifactId:'combined'})).rejects.toMatchObject({statusCode:409})
  headers[0].latest=false;m.save.mockClear();await expect(generateSchoolPlanGroup(input)).rejects.toMatchObject({statusCode:409});expect(m.save).not.toHaveBeenCalled()
 })
 it('preserves the saved report through wording-only changes while retaining numeric permission checks',async()=>{
  const generated=await generateSchoolPlanGroup(input)
  m.read.mockImplementation(({artifactId}:any)=>({...safe[artifactId],projection:{...safe[artifactId].projection,title:'新版标题',limitations:['新版文字']}}))
  expect(await readSchoolPlanGroup({...scope,artifactId:'combined'})).toEqual(generated)
 })
 it('keeps allowed outputs when another planned score is not disclosed, and retains per-wave suppression',async()=>{
  const hidden={...metric,id:'planned-B',scoreKey:'private-score',label:'B'}
  const actualPlan={...plan,metrics:[metric,hidden]},originalQuery=m.query.getMockImplementation()!
  m.query.mockImplementation((q:any)=>{const rows=originalQuery(q);return Array.isArray(rows)&&rows[0]?.ordinal?rows.map((w:any)=>({...w,tracking:{...w.tracking,...(w.ordinal===1?{plan:actualPlan}:{}),bindings:[...w.tracking.bindings,{...w.tracking.bindings[0],metricId:hidden.id,scoreKey:hidden.scoreKey}]}})):rows})
  expect((await generateSchoolPlanGroup(input)).projection.metrics.map(m=>m.id)).toEqual([metric.id])
  const spec=await m.spec();spec.definition.metricRules.push({metricId:'published-B',sourceMetricKey:hidden.scoreKey,minimumMetricN:10})
  safe.artifact1.projection.metrics.push({...safe.artifact1.projection.metrics[0],key:'published-B',mean:5})
  m.catalog.mockImplementation(({runId}:any)=>[{leaf:records['artifact'+runId.slice(-1)].artifactPayload.source.leaf,metrics:[{key:'score',unit:'score'},...(runId==='wave1'?[{key:hidden.scoreKey,unit:'score'}]:[])]}])
  const report=await generateSchoolPlanGroup(input)
  expect(report.projection.metrics[0].points[1].mean).toBe(2)
  expect(report.projection.metrics[1].points.map(p=>[p.mean,p.validN,p.missingN,p.state])).toEqual([[5,10,0,'present'],[null,null,null,'suppressed']])
 })
 it('uses the actual Cognitive protocol when compiled publication identities differ',async()=>{
  const actualPlan={...plan,metrics:[{...metric,kind:'COGNITIVE',measurementHash:canonicalHash({measurementHash:digest,profile:'experience'})}]}
  const originalQuery=m.query.getMockImplementation()!
  m.query.mockImplementation((q:any)=>{const result=originalQuery(q);return Array.isArray(result)&&result[0]?.ordinal?result.map((w:any)=>w.ordinal===1?{...w,tracking:{...w.tracking,plan:actualPlan}}:w):result})
  const [composite]=await m.composites();composite.trainingContentSnapshot.units[0].family='COGNITIVE';composite.trainingContentSnapshot.units[0].source.kind='COGNITIVE_CONFIG';composite.trainingContentSnapshotHash=canonicalHash(composite.trainingContentSnapshot);composite.items[0].cognitiveAssignment={profile:'experience'}
  for(const record of Object.values(records)){record.artifactPayload.source.leaf.unitType='COGNITIVE';record.artifactPayload.source.leaf.slotKey='cognitive:item-A'}
  m.catalog.mockImplementation(({runId}:any)=>[{leaf:records['artifact'+runId.slice(-1)].artifactPayload.source.leaf,protocolSignature:'actual-experience-protocol',metrics:[{key:'score',unit:'score'}]}])
  expect((await generateSchoolPlanGroup(input)).projection.metrics[0].points[1].baselineDelta).toBe(1)
 })
 it('keeps NONE/INDIVIDUAL_ONLY sources unavailable instead of deriving GROUP access from the personal plan',async()=>{
  m.catalog.mockResolvedValue([])
  await expect(generateSchoolPlanGroup(input)).rejects.toMatchObject({statusCode:409})
  expect(m.generate).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled()
 })
 it('rejects a cross-slot same-named score before source access',()=>{
  expect(()=>schoolPlanLeafBinding({schemaVersion:1,entry:'SCHOOL',bindings:[{metricId:'unrelated',trackId:'track1',itemId:'item-B',scoreKey:'score'}]},[metric])).toThrow('唯一')
 })
})
