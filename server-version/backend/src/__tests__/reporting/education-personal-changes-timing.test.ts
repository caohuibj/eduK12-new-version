import {randomUUID} from 'node:crypto'
import {afterEach,it,expect,vi} from 'vitest'
const m=vi.hoisted(()=>({query:vi.fn(),execute:vi.fn(),parents:vi.fn(),scope:vi.fn(),source:vi.fn(),leaves:vi.fn()}))
vi.mock('../../config/database',()=>({prisma:{$transaction:(work:any)=>work({$queryRaw:m.query,$executeRaw:m.execute,compositeAssessmentAttempt:{findMany:m.parents}})}}))
vi.mock('../../modules/organization/educationProductAccess',()=>({resolveEducationProductMemberScope:m.scope}))
vi.mock('../../modules/assessment-run/registeredResources',()=>({resolveHistoricalRelationalEntry:m.source}))
vi.mock('../../modules/composite/personal-tracking-results',()=>({readTrainingPersonalLeafs:m.leaves}))
import {readTeacherPersonalChanges} from '../../modules/reporting/teacher-personal-changes.service'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {testDisclosure} from '../assessment-policy/result-disclosure.fixture'
afterEach(()=>{vi.useRealTimers();vi.unstubAllEnvs();vi.resetAllMocks()})
it('gates native education feedback by its frozen opening time before snapshot reuse',async()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T08:00:00Z'));vi.stubEnv('DATA_ENCRYPTION_KEY','55'.repeat(32))
 const metricId=randomUUID(),baseline=randomUUID(),organizationId=randomUUID(),actor=randomUUID()
 const disclosure=testDisclosure();disclosure.audiences.RESPONDENT={mode:'INDIVIDUAL_SUMMARY',metricKeys:['latency'],longitudinalMetricKeys:['latency']}
 const policy={resultDisclosure:disclosure,runtimeLaunchTarget:{kind:'COMPOSITE',ref:'runtime'}},policyHash=canonicalHash(policy)
 const plan={schemaVersion:1,id:randomUUID(),baselineWaveId:baseline,metrics:[{id:metricId,sourceKey:'leaf',scoreKey:'latency',label:'Latency',unit:'ms',kind:'COGNITIVE',measurementHash:'a'.repeat(64)}]}
 const waves=[1,2].map(ordinal=>({id:randomUUID(),organizationId,runId:ordinal===1?baseline:randomUUID(),trackId:randomUUID(),ordinal,baselineId:baseline,assignmentId:randomUUID(),policy,policyHash,family:'COGNITIVE',key:'education-assessment:synthetic',version:'1.0.0',episodeId:randomUUID(),tracking:{} as any}))
 for(const wave of waves)wave.tracking={schemaVersion:1,entry:'TEACHER',bindings:[{metricId,trackId:wave.trackId,itemId:'leaf',scoreKey:'latency',visible:true}]}
 const parents=waves.map(w=>({id:randomUUID(),compositeAssessmentId:'runtime',assignmentRef:w.assignmentId,episodeId:w.episodeId,compositeAssessment:{trainingContentSnapshot:{}}}))
 const leaves=waves.map((w,i)=>({scopedSubjectId:organizationId+':'+actor,waveId:w.runId,ordinal:w.ordinal,attemptId:parents[i].id,resultId:parents[i].id,completedAt:'2026-10-29T08:00:00Z',sourceHash:'b'.repeat(64),metrics:{[metricId]:{value:300-i*10,unit:'ms',measurementHash:'a'.repeat(64),visible:true,pending:false}}}))
 m.scope.mockResolvedValue({membershipId:'own'});m.parents.mockResolvedValue(parents);m.leaves.mockImplementation(async()=>structuredClone(leaves))
 m.source.mockResolvedValue({releaseStatus:'PUBLISHED',resultDisclosure:disclosure,educationOrigin:{feedbackPolicy:{schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-11-01T08:00:00Z'}}})
 const hashes:string[]=[]
 m.query.mockImplementation(async(query:any,...values:any[])=>{
  const sql=(Array.isArray(query)?query:query.strings).join(' ')
  if(sql.includes('SELECT personal_tracking AS tracking'))return [{tracking:{...waves[0].tracking,plan}}]
  if(sql.includes('personal_tracking_ordinal AS ordinal FROM assessment_runs'))return waves.map(w=>({id:w.runId,ordinal:w.ordinal}))
  if(sql.includes('FROM assessment_run_executions e JOIN'))return sql.includes('jsonb_array_elements')?waves:[waves[1]]
  if(sql.includes('DISTINCT ON'))return parents.map(p=>({id:p.id}))
  if(sql.includes('personal_changes_snapshots->>')){hashes.push(values[0]);return [{cipher:null}]}
  return []
 })
 const input={actorUserId:actor,executionId:waves[1].id}
 expect((await readTeacherPersonalChanges(input)).status).toBe('WAITING');expect(m.execute).not.toHaveBeenCalled()
 vi.setSystemTime(new Date('2026-11-02T08:00:00Z'))
 const opened=await readTeacherPersonalChanges(input);expect(opened.status).toBe('AVAILABLE')
 expect((opened as any).metrics[0].points.map((p:any)=>p.value)).toEqual([300,290])
 expect(hashes[0]).not.toBe(hashes[1]);expect(m.execute).toHaveBeenCalledTimes(1)
})
