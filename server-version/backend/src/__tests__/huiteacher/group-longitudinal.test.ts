import {randomUUID} from 'node:crypto'
import {beforeEach,expect,it,vi} from 'vitest'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
const mocks=vi.hoisted(()=>({db:{$queryRaw:vi.fn(),$transaction:vi.fn(),compositeAssessment:{findMany:vi.fn()}},authority:vi.fn(),discover:vi.fn(),generate:vi.fn(),read:vi.fn(),record:vi.fn(),spec:vi.fn(),save:vi.fn(),saved:vi.fn(),page:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:mocks.db}))
vi.mock('../../modules/huiteacher/groupReportAuthority',()=>({assertTeacherGroupAuthority:mocks.authority}))
vi.mock('../../modules/reporting/resultSource',()=>({listAuthoritativeRunLeafSources:mocks.discover}))
vi.mock('../../modules/huiteacher/numericGroupReport.service',()=>({generateTeacherNumericGroup:mocks.generate,readTeacherNumericGroup:mocks.read}))
vi.mock('../../modules/reporting/artifact',()=>({readReportingArtifactRecord:mocks.record}))
vi.mock('../../modules/reporting/spec',()=>({getPublishedReportingSpec:mocks.spec}))
vi.mock('../../modules/reporting/task-artifact',()=>({saveTaskGroupLongitudinalArtifact:mocks.save,readTaskGroupLongitudinalArtifact:mocks.saved,listTaskGroupLongitudinalArtifactsPage:mocks.page}))
import {generateTeacherGroupLongitudinal,readTeacherGroupLongitudinal,teacherGroupLongitudinalCatalog} from '../../modules/huiteacher/groupLongitudinalReport.service'
let data:ReturnType<typeof fixture>
function fixture(){
 const org=randomUUID(),actor=randomUUID(),planId=randomUUID(),metricId=randomUUID(),sourceKey='frozen-tool',ids=[1,2,3].map(()=>randomUUID()),events=ids.map(()=>randomUUID()),tracks=ids.map(()=>randomUUID()),items=ids.map(()=>randomUUID()),composites=ids.map(()=>randomUUID())
 const plan={schemaVersion:1,id:planId,baselineWaveId:ids[0],metrics:[{id:metricId,sourceKey,scoreKey:'support',label:'支持',unit:'score',kind:'SCALE',measurementHash:'a'.repeat(64)}]}
 const waves=ids.map((id,i)=>({id,eventId:events[i],ordinal:i+1,name:'T'+(i+1),tracking:{schemaVersion:1,entry:'TEACHER',...(i===0?{plan}:{}),bindings:[{metricId,trackId:tracks[i],itemId:items[i],scoreKey:'support',visible:false}]}}))
 const policies=ids.map((runId,i)=>({id:tracks[i],runId,policy:{runtimeLaunchTarget:{kind:'COMPOSITE',ref:composites[i]}},hash:''}));policies.forEach(p=>p.hash=canonicalHash(p.policy))
 const compositeRows=composites.map((id,i)=>{const snapshot={schemaVersion:1,compositeId:id,units:[{itemId:items[i],family:'SCALE',source:{kind:'SCALE',id:'scale',ownerId:actor},measurement:{releaseId:randomUUID(),contentHash:'a'.repeat(64),measurementHash:'a'.repeat(64)}}]};return{id,items:[{id:items[i]}],trainingContentSnapshot:snapshot,trainingContentSnapshotHash:canonicalHash(snapshot)}})
 const leafs=ids.map((_id,i)=>({slotKey:'scale:'+items[i],unitType:'SCALE',instrumentKey:'scale',instrumentVersion:'1.0.0',compiledRuntimeHash:String(i+1).repeat(64)}))
 const headers=ids.flatMap((runId,i)=>Array.from({length:10},(_,n)=>({executionId:'e'+i+'-'+n,runId,trackId:tracks[i],subjectId:'s'+n,attemptId:'p'+i+'-'+n,epoch:1,completedAt:new Date('2026-10-'+(20+i)+'T12:00:00Z'),latest:true})))
 const reports=ids.map((_id,i)=>({artifactId:'artifact-'+i,generatedAt:'2026-10-30T00:00:00Z',projection:{title:'safe',sourceLabel:'safe',cutoff:'2026-10-30T00:00:00Z',populationLabel:'冻结人群'+i,completedN:10,assignedN:10,countUnit:'PERSON',tool:{key:'scale',title:'scale',kind:'SCALE'},metrics:[{key:'reported-support',label:'支持',type:'NUMBER',unit:'score',state:'present',validN:10,missingN:0,mean:i,sdSample:0,range:null,observedRange:null,frequencies:[],qualityCounts:{}}],limitations:[]}}))
 return {org,actor,planId,metricId,sourceKey,ids,events,tracks,items,plan,waves,policies,compositeRows,leafs,headers,reports,empty:new Set<number>(),stored:null as any}
}
beforeEach(()=>{
 vi.clearAllMocks();data=fixture();mocks.authority.mockResolvedValue({productAdmin:true});mocks.page.mockResolvedValue({artifacts:[],nextCursor:null})
 mocks.db.$transaction.mockImplementation(async(fn:any)=>fn(mocks.db))
 mocks.db.$queryRaw.mockImplementation(async(q:any)=>{const sql=(Array.isArray(q)?q:q.strings).join('');if(sql.includes('AS "baselineId"'))return[{runId:data.ids[0],baselineId:data.ids[0],tracking:data.waves[0].tracking}];if(sql.includes('FROM assessment_runs r JOIN'))return data.waves;if(sql.includes('FROM assessment_run_tracks'))return data.policies;if(sql.includes('JOIN composite_assessment_attempts p'))return data.headers;throw Error('Unexpected SQL '+sql)})
 mocks.db.compositeAssessment.findMany.mockImplementation(async()=>data.compositeRows)
 mocks.discover.mockImplementation(async(input:any)=>{const i=data.ids.indexOf(input.runId);return data.empty.has(i)?[]:[{leaf:data.leafs[i],metrics:[{key:'support',unit:'score'}]}]})
 mocks.spec.mockResolvedValue({definition:{analysisKind:'GROUP',metricRules:[{metricId:'reported-support',sourceMetricKey:'support'}]}})
 mocks.generate.mockImplementation(async(input:any)=>data.reports[data.events.indexOf(input.eventId)])
 mocks.read.mockImplementation(async(input:any)=>data.reports.find(r=>r.artifactId===input.artifactId))
 mocks.record.mockImplementation(async(id:string)=>{const i=data.reports.findIndex(r=>r.artifactId===id);return{id,organizationId:data.org,analysisKind:'GROUP',snapshotHash:'snapshot'+i,artifactPayload:{schemaVersion:2,source:{runId:data.ids[i],trackId:data.tracks[i],leaf:data.leafs[i]},inputManifest:data.headers.filter(h=>h.runId===data.ids[i]).map(h=>({executionId:h.executionId,subjectUserId:h.subjectId}))}}})
 mocks.save.mockImplementation(async(_db:any,input:any)=>{data.stored={...input,artifactId:'saved',generatedAt:'2026-10-31T00:00:00Z'};return{artifactId:'saved',generatedAt:data.stored.generatedAt,projection:input.projection}});mocks.saved.mockImplementation(async()=>data.stored)
})
const scope=()=>({organizationId:data.org,eventId:data.events[0],actorUserId:data.actor})
const command=()=>({...scope(),planId:data.planId,sourceKey:data.sourceKey,throughWaveId:data.ids[2],specId:randomUUID(),selection:{kind:'ALL' as const}})
it('uses baseline-owned plans with inherited later bindings, actual slot/time and original aggregate readers',async()=>{
 const catalog=await teacherGroupLongitudinalCatalog(scope());expect(catalog.status).toBe('CONFIGURED');expect(mocks.discover).not.toHaveBeenCalled()
 const report=await generateTeacherGroupLongitudinal(command());expect(report.projection.metrics[0].points.map(p=>p.mean)).toEqual([0,1,2]);expect(report.projection.metrics[0].points[0].observedFrom).toBe('2026-10-20T12:00:00.000Z')
 expect(mocks.discover.mock.calls.map(([q])=>q.slotKey)).toEqual(data.leafs.map(l=>l.slotKey));expect(mocks.generate).toHaveBeenCalledTimes(3)
 const previous=mocks.discover.mock.calls.length;expect(await readTeacherGroupLongitudinal({...scope(),artifactId:'saved'})).toEqual(report);expect(mocks.discover).toHaveBeenCalledTimes(previous);expect(mocks.read).toHaveBeenCalledTimes(3)
})
it('retains a whole missing middle round without inventing a leaf, numbers, or replaying its generator',async()=>{
 data.empty.add(1);data.headers=data.headers.filter(h=>h.runId!==data.ids[1]);const report=await generateTeacherGroupLongitudinal(command()),points=report.projection.metrics[0].points
 expect(points[1]).toMatchObject({state:'missing',mean:null,validN:null,missingN:null,completedN:null,observedFrom:null});expect(points[2]).toMatchObject({adjacentDelta:null,baselineDelta:2,intermediateMissing:true});expect(mocks.generate).toHaveBeenCalledTimes(2)
 await readTeacherGroupLongitudinal({...scope(),artifactId:'saved'});expect(mocks.read).toHaveBeenCalledTimes(2)
})
it('rejects an actual changed frozen measurement and never flattens another slot with the same score key',async()=>{
 data.compositeRows[1].trainingContentSnapshot.units[0].measurement.measurementHash='b'.repeat(64);data.compositeRows[1].trainingContentSnapshotHash=canonicalHash(data.compositeRows[1].trainingContentSnapshot)
 await expect(generateTeacherGroupLongitudinal(command())).rejects.toMatchObject({statusCode:409});expect(mocks.generate).not.toHaveBeenCalled()
 data=fixture();data.leafs[1].slotKey='scale:other';await expect(generateTeacherGroupLongitudinal(command())).rejects.toMatchObject({statusCode:409});expect(mocks.generate).not.toHaveBeenCalled()
})
it('checks real organization authority and keeps historical reads subject to current numeric disclosure',async()=>{
 mocks.authority.mockRejectedValueOnce(Object.assign(Error('denied'),{statusCode:404}));await expect(teacherGroupLongitudinalCatalog(scope())).rejects.toMatchObject({statusCode:404});expect(mocks.db.$queryRaw).not.toHaveBeenCalled()
 await generateTeacherGroupLongitudinal(command());mocks.read.mockRejectedValueOnce(Object.assign(Error('withheld'),{statusCode:404}));await expect(readTeacherGroupLongitudinal({...scope(),artifactId:'saved'})).rejects.toMatchObject({statusCode:404})
})

it('uses the existing Scale points/score raw-unit names only after the same frozen C, and rejects other units',async()=>{
 data.plan.metrics[0].unit='points'
 const result=await generateTeacherGroupLongitudinal(command());expect(result.projection.metrics[0].unit).toBe('points');expect(result.projection.metrics[0].points.map(p=>p.mean)).toEqual([0,1,2])
 mocks.discover.mockImplementation(async(input:any)=>[{leaf:data.leafs[data.ids.indexOf(input.runId)],metrics:[{key:'support',unit:'milliseconds'}]}])
 await expect(generateTeacherGroupLongitudinal(command())).rejects.toMatchObject({statusCode:409})
})

it('uses the internal partial-source producer and keeps B null when only A is disclosed in the second planned wave',async()=>{
 const first=data.plan.metrics[0],second={...first,id:randomUUID(),scoreKey:'load',label:'工作负担'}
 data.plan.metrics.push(second)
 data.waves.forEach((wave,i)=>wave.tracking.bindings.push({...wave.tracking.bindings[0],metricId:second.id,scoreKey:'load'}))
 mocks.spec.mockResolvedValue({definition:{analysisKind:'GROUP',metricRules:[{metricId:'reported-support',sourceMetricKey:'support'},{metricId:'reported-load',sourceMetricKey:'load'}]}})
 data.reports[0].projection.metrics.push({...data.reports[0].projection.metrics[0],key:'reported-load',label:'工作负担',mean:7})
 mocks.discover.mockImplementation(async(input:any)=>{const i=data.ids.indexOf(input.runId);return[{leaf:data.leafs[i],metrics:i===0?[{key:'support',unit:'score'},{key:'load',unit:'score'}]:[{key:'support',unit:'score'}]}]})
 const report=await generateTeacherGroupLongitudinal({...command(),throughWaveId:data.ids[1]})
 expect(mocks.generate).toHaveBeenCalledTimes(2)
 for(const args of mocks.generate.mock.calls)expect(args[1]).toEqual({allowPartialSourceMetrics:true})
 const [a,b]=report.projection.metrics
 expect(a.points.map(p=>p.mean)).toEqual([0,1]);expect(a.points[1].adjacentDelta).toBe(1)
 expect(b.points.map(p=>p.mean)).toEqual([7,null]);expect(b.points[1]).toMatchObject({state:'suppressed',validN:null,missingN:null,adjacentDelta:null,baselineDelta:null})
 const discoveries=mocks.discover.mock.calls.length
 expect(await readTeacherGroupLongitudinal({...scope(),artifactId:'saved'})).toEqual(report)
 expect(mocks.discover).toHaveBeenCalledTimes(discoveries);expect(mocks.read).toHaveBeenCalledTimes(2)
})
