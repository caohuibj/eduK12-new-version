import {beforeEach,expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({db:{compositeAssessment:{findUnique:vi.fn()},compositeAssessmentAttempt:{findFirst:vi.fn(),findMany:vi.fn()},$transaction:vi.fn()},catalog:vi.fn(),prepare:vi.fn(),save:vi.fn(),read:vi.fn(),current:vi.fn(),stored:null as any}))
vi.mock('../../config/database',()=>({prisma:m.db}))
vi.mock('../../modules/training-analysis/source',()=>({assertTrainingGroupTaskHistoryAccess:vi.fn(),assertTrainingGroupAccess:vi.fn(),listTrainingGroupPlanTasks:async()=>[1,2,3].map(i=>({id:'T'+i,name:'T'+i,personalTrackingOrdinal:i,personalTracking:{schemaVersion:1,bindings:[{metricId:'metric',itemId:'item'+i,scoreKey:'total',visible:true}]}})),listTrainingAnalysisSources:m.catalog}))
vi.mock('../../modules/training-analysis/group-report.service',()=>({prepareTrainingGroupReport:m.prepare,assertTrainingGroupBindingsCurrent:m.current}))
vi.mock('../../modules/reporting/task-artifact',()=>({saveTaskGroupLongitudinalArtifact:m.save,readTaskGroupLongitudinalArtifact:m.read,listTaskGroupLongitudinalArtifactsPage:vi.fn()}))
import {generateTrainingGroupLongitudinal,readTrainingGroupLongitudinal} from '../../modules/training-analysis/group-longitudinal.service'
const plan={schemaVersion:1,id:'10000000-0000-4000-8000-000000000001',baselineWaveId:'T1',metrics:[{id:'metric',sourceKey:'item1',scoreKey:'total',kind:'SCALE',label:'A',unit:'score',measurementHash:'a'.repeat(64)}]}
const scope={actor:{userId:'teacher',role:'TEACHER'} as const,courseId:'course',taskId:'T3'}
beforeEach(()=>{
 vi.resetAllMocks();m.stored=null
 m.db.compositeAssessment.findUnique.mockImplementation(async(q:any)=>q.where.id!=='T1'?{personalTrackingBaselineId:'T1'}:{createdBy:'teacher',personalTracking:{schemaVersion:1,plan,bindings:[{metricId:'metric',itemId:'item1',scoreKey:'total',visible:true}]}})
 m.db.$transaction.mockImplementation(async fn=>fn(m.db))
 m.db.compositeAssessmentAttempt.findFirst.mockResolvedValue(null);m.db.compositeAssessmentAttempt.findMany.mockResolvedValue([])
 m.catalog.mockImplementation(async(_tx:any,_actor:any,_course:any,options:any)=>({tools:options.taskId==='T2'?[]:[{key:'item'+options.taskId.slice(1),source:{taskId:options.taskId,metrics:[{itemId:'item'+options.taskId.slice(1),metricKey:'total'}],publication:'2026-10-01T00:00:00Z',configDigest:null,variantKey:null}}]}))
 m.prepare.mockImplementation(async({selection}:any)=>({projection:{schemaVersion:1,descriptionVersion:'group-descriptive-v1',title:'A',cutoff:'2026-10-31T00:00:00Z',completedN:5,countUnit:'PERSON',metrics:[{key:'total',type:'NUMBER',unit:'score',state:'present',validN:5,missingN:0,mean:Number(selection.taskId.slice(1)),sdSample:0}],limitations:[]},definitions:[],populationKeys:['person'],sourceBindings:{parents:[],snapshots:[],sources:[],qualityHash:'q',governanceHash:'g'}}))
 m.save.mockImplementation(async(_tx:any,value:any)=>{m.stored={...value,artifactId:'saved',generatedAt:'2026-10-31T00:00:00Z'};return {artifactId:m.stored.artifactId,generatedAt:m.stored.generatedAt,projection:m.stored.projection}})
 m.read.mockImplementation(async()=>m.stored)
})
it('keeps empty Scale T2 between completed T1/T3 and freezes the gap instead of rescanning on read',async()=>{
 const result=await generateTrainingGroupLongitudinal({...scope,planId:plan.id,sourceKey:'item1',throughWaveId:'T3'})
 expect(result.projection.metrics[0].points.map(p=>[p.mean,p.adjacentDelta,p.baselineDelta])).toEqual([[1,null,null],[null,null,null],[3,null,2]])
 expect(result.projection.metrics[0].points[1]).toMatchObject({state:'missing',completedN:null,validN:null,observedFrom:null})
 expect(m.stored.sourceBindings.waves[1]).toEqual({taskId:'T2',missing:true})
 expect(m.prepare).toHaveBeenCalledTimes(2)
 m.db.compositeAssessmentAttempt.findFirst.mockResolvedValue({id:'later-T2'})
 m.catalog.mockClear();m.prepare.mockClear()
 expect(await readTrainingGroupLongitudinal({...scope,artifactId:'saved'})).toEqual(result)
 expect(m.catalog).not.toHaveBeenCalled();expect(m.prepare).not.toHaveBeenCalled()
 expect(m.current).toHaveBeenCalledTimes(4)
})
it('does not turn a populated but undisclosed source into an empty wave',async()=>{
 m.db.compositeAssessmentAttempt.findFirst.mockResolvedValue({id:'completed-T2'})
 await expect(generateTrainingGroupLongitudinal({...scope,planId:plan.id,sourceKey:'item1',throughWaveId:'T3'})).rejects.toThrow('没有当前课程')
 expect(m.save).not.toHaveBeenCalled()
})
