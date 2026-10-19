/** One read-only ordinary-anonymous/non-study analysis cost observation.
 * Existing accepted facts only; no fixture creation or scientific requalification. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createHash} from 'node:crypto'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {analyzeTrainingCourse,discoverTrainingCourseSources}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const state=process.argv[2],input=JSON.parse(fs.readFileSync(path.join(state,'c18-anonymous-candidate.json')))
const sha=value=>createHash('sha256').update(value).digest('hex')
assert.equal(process.env.NODE_ENV,'test');assert.equal(new URL(process.env.DATABASE_URL).username,'eduk12_runtime')
assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1');assert.equal(process.env.PERF_SQL_EVENT_COUNT,'1')
const result={passed:false,scope:'READ_ONLY_EXISTING_ORDINARY_ANONYMOUS_NON_STUDY_COST',sourceCommit:process.env.C18_SOURCE_COMMIT??null}
let trace=null
prisma.$on('query',event=>{if(trace)trace.push({sql:event.query,params:JSON.parse(event.params),durationMs:event.duration})})
try {
 const actor={id:input.actorId,role:input.actorRole??'TEACHER'},courseId=input.courseId
 const discovered=await discoverTrainingCourseSources(actor,courseId)
 const available=discovered.list.filter(row=>(input.taskIds??[input.taskId]).includes(row.taskId)&&row.metrics.length)
 let selector=input.selector
 if(!selector){
  // Prefer distinct published tasks/variant strata. If only one source exists,
  // distinct metrics exercise the batch without claiming meaningful pairing.
  const picks=available.length>=2?available.slice(0,2).map(row=>({...row,metrics:row.metrics.slice(0,1)})):
   available.length===1&&available[0].metrics.length>=2?[0,1].map(i=>({...available[0],metrics:[available[0].metrics[i]]})):[]
  assert.equal(picks.length,2,'Need two authorized distinct source/metric selectors from existing facts')
  selector={schemaVersion:1,courseId,mode:'PAIRWISE',waves:picks.map((row,i)=>({waveKey:`ordinary-anonymous-${i+1}`,taskId:row.taskId,publication:row.publication,configDigest:row.configDigest,variantKey:row.variantKey,metrics:row.metrics.map(({itemId,metricKey})=>({itemId,metricKey}))}))}
 }
 result.selector=selector
 const selectedTasks=[...new Set(selector.waves.map(row=>row.taskId))]
 const candidates=await prisma.compositeAssessmentAttempt.findMany({where:{compositeAssessmentId:{in:selectedTasks},deliveryCourseId:courseId,userId:null,assignmentRef:null,status:'COMPLETED'},select:{id:true,accessTokenId:true,runtimeGeneration:true,deliveryMode:true}})
 assert.ok(candidates.length>0,'Must exercise real existing completed anonymous attempts')
 const bindings=await prisma.$queryRawUnsafe('SELECT count(*)::int AS n FROM anonymous_study_waves WHERE access_token_id=ANY($1::text[])',candidates.map(row=>row.accessTokenId).filter(Boolean))
 assert.equal(bindings[0].n,0,'Selected ordinary anonymous sources must have no study binding')
 trace=[];const started=performance.now()
 let analyzed,analysisError
 try {analyzed=await analyzeTrainingCourse({actor,courseId,selector})} catch(error){
  assert.equal(error.code,'AMBIGUOUS_OBSERVATION');assert.equal(error.statusCode,409);analysisError={code:error.code,statusCode:error.statusCode,message:error.message}
 }
 result.analysisOutcome=analysisError?{state:'REJECTED_EXISTING_DUPLICATE_OBSERVATIONS',...analysisError}:{state:'SUCCEEDED'}
 const elapsedMs=performance.now()-started,events=trace;trace=null
 const governance=events.filter(event=>event.sql.includes('anonymous_study_research_states'))
 assert.equal(governance.length,1,'Governance remains in one existing identity batch')
 assert.equal(events.filter(event=>event.sql.includes('anonymous_study_research_audit')).length,0)
 if(analyzed)assert.equal(analyzed.manifest.schemaVersion,1)
 const query=governance[0]
 const planRows=await prisma.$queryRawUnsafe('EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '+query.sql,...query.params)
 const plan=planRows[0]['QUERY PLAN'][0],relations=[]
 function visit(node){if(node['Relation Name'])relations.push({table:node['Relation Name'],nodeType:node['Node Type'],rows:node['Actual Rows'],loops:node['Actual Loops'],sharedHitBlocks:node['Shared Hit Blocks'],sharedReadBlocks:node['Shared Read Blocks']});for(const child of node.Plans??[])visit(child)}visit(plan.Plan)
 result.measurement={sql:events.length,sqlMs:events.reduce((sum,event)=>sum+event.durationMs,0),elapsedMs,governanceContainingStatements:governance.length,addedGovernanceStatements:0,explanation:'The pre-existing bounded anonymous identity batch now contains governance LEFT JOINs; this is one SQL statement, not one additional statement.',candidateAttempts:candidates.length,identityBatchSelectedAttemptCount:query.params.filter(value=>candidates.some(row=>row.id===value)).length,identityBatchReturnedRows:plan.Plan['Actual Rows'],manifestSchemaVersion:analyzed?.manifest.schemaVersion??null,manifestSourceRows:analyzed?.manifest.sources.length??null,observations:analyzed?.manifest.observationCount??null,manifestBytes:analyzed?Buffer.byteLength(JSON.stringify(analyzed.manifest)):null,analysisBytes:analyzed?Buffer.byteLength(JSON.stringify(analyzed.analysis)):null,planningMs:plan['Planning Time'],executionMs:plan['Execution Time'],relations,querySha256:sha(query.sql),queryParamsSha256:sha(JSON.stringify(query.params))}
 assert.ok(result.measurement.identityBatchSelectedAttemptCount>0,'Actual ordinary anonymous IDs must reach identity batch')
 result.queries=events.map(({sql,params,durationMs})=>({sql,paramsSha256:sha(JSON.stringify(params)),durationMs}))
 result.explain=plan
 result.passed=true
 console.log('PASS ordinary anonymous non-study read-only query-cost and EXPLAIN; analysis outcome '+result.analysisOutcome.state)
} catch(error){result.error={name:error.name,message:error.message};throw error}
finally {fs.writeFileSync(path.join(state,'c18-anonymous-cost-result.json'),JSON.stringify(result,null,2)+'\n',{mode:0o600});const queues=require.cache[path.join(backend,'dist/config/queue.js')]?.exports;if(queues)await queues.closeQueues();await prisma.$disconnect()}
