/** Actual SQL-event and wall-time diagnostics, not a capacity qualification.
 * Each invocation is a fresh process: first run cold, second run same-template hot.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const backend=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../backend'),require=createRequire(path.join(backend,'package.json'))
const {prisma}=require(path.join(backend,'dist/config/database.js'))
const {analyzeTrainingCourse}=require(path.join(backend,'dist/modules/training-analysis/service.js'))
const {closeQueues}=require(path.join(backend,'dist/config/queue.js'))
const state=process.argv[2],n=Number(process.argv[3]),fixture=JSON.parse(fs.readFileSync(path.join(state,'c16-fixture-private.json')))
assert.equal(fixture.participants.length,n);assert.equal(process.env.PERF_SQL_EVENT_COUNT,'1');assert.equal(process.env.PERF_ISOLATED_TEST_MODE,'1')
let count=0,duration=0,membershipReads=0;prisma.$on('query',event=>{count++;duration+=event.duration;if(/SELECT/i.test(event.query)&&/course_students/i.test(event.query))membershipReads++})
const rows=[]
try{
 await prisma.$connect()
 for(const temperature of ['PROCESS_COLD_TEMPLATE_FIRST_READ','SAME_PROCESS_TEMPLATE_HOT']){
  const before=count,sqlBefore=duration,membersBefore=membershipReads,start=performance.now()
  const result=await analyzeTrainingCourse({actor:{id:fixture.teacherId,role:'TEACHER'},courseId:fixture.courseId,selector:fixture.selector})
  rows.push({participants:n,waves:2,tools:4,temperature,sqlEvents:count-before,courseStudentReads:membershipReads-membersBefore,sqlDurationMs:duration-sqlBefore,elapsedMs:performance.now()-start,sourceCount:result.manifest.sources.length,observationCount:result.manifest.observationCount,analysisState:result.analysis.state})
  assert.equal(membershipReads-membersBefore,0);assert.equal(result.manifest.sources.length,2*n);assert.equal(result.manifest.observationCount,8*n)
 }
 fs.writeFileSync(path.join(state,`c16-measure-${n}.json`),JSON.stringify({passed:true,scope:'REAL_PG_SQL_EVENT_DIAGNOSTIC_NOT_CAPACITY',rows},null,2));console.log(JSON.stringify(rows))
}finally{await closeQueues(true);await prisma.$disconnect()}
