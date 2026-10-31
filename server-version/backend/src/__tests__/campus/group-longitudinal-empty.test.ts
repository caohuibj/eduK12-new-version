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
const input={...scope,planId:plan.id,sourceKey:metric.sourceKey,throughWaveId:'wave3',specId:'existing-GROUP',selection:{kind:'CLASSES' as const,ids:['class-A']}}
let safe:Record<string,any>,records:Record<string,any>,stored:any,headers:any[]
beforeEach(()=>{
 vi.resetAllMocks();stored=undefined
 const waves=[1,2,3].map(i=>({id:'wave'+i,ordinal:i,name:'T'+i,tracking:{schemaVersion:1,entry:'SCHOOL',bindings:[{metricId:metric.id,trackId:'track'+i,itemId:'item-A',scoreKey:'score',visible:false}],...(i===1?{plan}:{})}}))
 const snapshot={schemaVersion:1,compositeId:'frozen-tool',units:[{itemId:'item-A',family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:'owner'},measurement:{releaseId:randomUUID(),contentHash:digest,measurementHash:digest}}]}
 const policy={runtimeLaunchTarget:{kind:'COMPOSITE',ref:'frozen-tool'}}
 headers=[1,2,3].map(i=>({executionId:'execution'+i,runId:'wave'+i,trackId:'track'+i,subjectId:'person'+i,attemptId:'parent'+i,epoch:1,completedAt:new Date('2026-09-0'+i+'T12:00:00Z'),latest:true}))
 m.query.mockImplementation((q:any)=>{const sql=(Array.isArray(q)?q:q.strings).join(' ');if(sql.includes('SELECT run.personal_tracking_baseline_id'))return[{baselineId:'wave1',tracking:waves[0].tracking}];if(sql.includes('SELECT run.id,run.personal_tracking_ordinal'))return waves;if(sql.includes('FROM assessment_run_tracks'))return waves.map((w,i)=>({id:'track'+(i+1),runId:w.id,policy,policyHash:canonicalHash(policy)}));if(sql.includes('JOIN composite_assessment_attempts'))return headers;throw Error('Unexpected query '+sql)})
 m.transaction.mockImplementation((fn:any)=>fn({}));m.manager.mockResolvedValue({userId:'manager',groupAudience:'ORGANIZATION'});m.list.mockResolvedValue([])
 m.composites.mockResolvedValue([{id:snapshot.compositeId,trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot),items:[{id:'item-A'}]}])
 m.spec.mockResolvedValue({definition:{analysisKind:'GROUP',minimumCohortN:10,minimumContributorN:10,metricRules:[{metricId:'published-score',sourceMetricKey:'score',minimumMetricN:10}]}})
 safe={};records={}
 for(const i of [1,2,3]){
  const leaf={slotKey:'scale:item-A',unitType:'SCALE',instrumentKey:'A',instrumentVersion:'1',compiledRuntimeHash:String(i).repeat(64)}
  const projection={schemaVersion:1,title:'school',populationLabel:'冻结班级'+i,cutoff:'2026-10-30T00:00:00Z',completedN:10,countUnit:'PERSON',metrics:[{key:'published-score',type:'NUMBER',unit:'score',state:'present',validN:10,missingN:0,mean:i,sdSample:0}],limitations:['frozen School policy']}
  safe['artifact'+i]={artifactId:'artifact'+i,generatedAt:'2026-10-30T00:00:00Z',projection}
  records['artifact'+i]={id:'artifact'+i,organizationId:'school',snapshotHash:'saved'+i,analysisKind:'GROUP',artifactPayload:{schemaVersion:2,source:{runId:'wave'+i,trackId:'track'+i,leaf},inputManifest:[{executionId:'execution'+i,subjectUserId:'person'+i}]}}
 }
 m.catalog.mockImplementation(({runId}:any)=>[{leaf:records['artifact'+runId.slice(-1)].artifactPayload.source.leaf,metrics:[{key:'score',unit:'score'}]}])
 m.generate.mockImplementation(({runId}:any)=>safe['artifact'+runId.slice(-1)]);m.read.mockImplementation(({artifactId}:any)=>safe[artifactId]);m.record.mockImplementation((id:string)=>records[id])
 m.save.mockImplementation((_tx:any,value:any)=>{stored={...value,artifactId:'combined',generatedAt:'2026-10-30T00:00:00Z'};return{artifactId:stored.artifactId,generatedAt:stored.generatedAt,projection:stored.projection}});m.readSaved.mockImplementation(()=>stored)
})

it('keeps an empty published T2 between T1/T3 and never fills the saved gap on later reads',async()=>{
 headers=headers.filter(h=>h.runId!=='wave2')
 const discover=m.catalog.getMockImplementation()!
 m.catalog.mockImplementation((input:any)=>input.runId==='wave2'?[]:discover(input))
 const result=await generateSchoolPlanGroup(input)
 expect(result.projection.metrics[0].points.map(p=>[p.mean,p.adjacentDelta,p.baselineDelta])).toEqual([[1,null,null],[null,null,null],[3,null,2]])
 expect(result.projection.metrics[0].points[1]).toMatchObject({state:'missing',completedN:null,validN:null,observedFrom:null})
 expect(stored.sourceBindings.waves[1]).toEqual({runId:'wave2',trackId:'track2',missing:true})
 expect(m.generate).toHaveBeenCalledTimes(2)
 // A later valid T2 must affect only a newly generated version.
 m.catalog.mockImplementation(discover);headers.push({executionId:'execution2',runId:'wave2',trackId:'track2',subjectId:'person2',attemptId:'parent2',epoch:1,completedAt:new Date('2026-09-02T12:00:00Z'),latest:true})
 m.catalog.mockClear();m.generate.mockClear()
 expect(await readSchoolPlanGroup({...scope,artifactId:'combined'})).toEqual(result)
 expect(m.read).toHaveBeenCalledTimes(2);expect(m.catalog).not.toHaveBeenCalled();expect(m.generate).not.toHaveBeenCalled()
})
