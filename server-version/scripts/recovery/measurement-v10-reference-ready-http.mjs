/** One new synthetic attempt, one denied direct runner GET; no accepted fact. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
const state=path.resolve(process.argv[2]??'')
assert.ok(state.startsWith('/workspace/scratch/5a77e8bdc1ae/measurement-v10-connected-'))
assert.equal(process.env.NODE_ENV,'test');assert.equal(process.env.MEASUREMENT_V10_FIXTURE,'1')
assert.equal(process.version,'v24.21.0')
const candidate=JSON.parse(fs.readFileSync(path.join(state,'candidate-inputs.json')))
assert.equal(candidate.head,process.env.MEASUREMENT_V10_HEAD)
assert.equal(candidate.sourceRoot,process.env.MEASUREMENT_V10_SOURCE_ROOT)
const url=new URL(process.env.DATABASE_URL)
assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'39403');assert.equal(url.pathname,'/eduk12_measurement_v10_test')
const backend=path.join(candidate.sourceRoot,'server-version/backend'),require=createRequire(path.join(backend,'package.json'))
const {PrismaClient}=require('@prisma/client'),db=new PrismaClient()
const fixturePath=path.join(state,'training-fixture-private.json'),fixture=JSON.parse(fs.readFileSync(fixturePath))
assert.equal(fixture.referenceContext.complete,true)
assert.ok(!fixture.referenceReadyGate?.passed,'A passed unchanged negative is never repeated')
const result={head:candidate.head,candidatePatches:JSON.parse(fs.readFileSync(path.join(state,'candidate-patches.json'))),
  scriptSha256:createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex'),
  passed:false,requests:[]}
const save=()=>fs.writeFileSync(fixturePath,JSON.stringify(fixture,null,2),{mode:0o600}),cookies=new Map()
async function request(route,method='GET',body,expected=200){
  const response=await fetch('http://127.0.0.1:39991/api'+route,{method,signal:AbortSignal.timeout(15000),
    headers:{'content-type':'application/json',cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),
      ...(cookies.has('ptool_csrf')?{'x-csrf-token':cookies.get('ptool_csrf')}:{})},
    ...(body===undefined?{}:{body:JSON.stringify(body)})})
  for(const raw of response.headers.getSetCookie()){const [pair]=raw.split(';');const i=pair.indexOf('=');cookies.set(pair.slice(0,i),pair.slice(i+1))}
  const bytes=Buffer.from(await response.arrayBuffer()),value=JSON.parse(bytes.toString())
  result.requests.push({route,method,status:response.status,sha256:createHash('sha256').update(bytes).digest('hex')})
  assert.equal(response.status,expected,JSON.stringify(value))
  if(expected===200)assert.equal(value.code,0,JSON.stringify(value))
  return value
}
try{
  const actor=fixture.students[1]
  await request('/auth/csrf')
  await request('/auth/training-login','POST',{username:actor.username,password:fixture.password,expectedRole:actor.role})
  if(!fixture.referenceReadyGate){
    const created=await request(`/composite-assessments/${fixture.referenceContext.product.id}/attempts`,'POST',{})
    assert.equal(created.data.attempt.currentItem.type,'FORM_SECTION')
    fixture.referenceReadyGate={attemptId:created.data.attempt.id};save()
  }
  const attemptId=fixture.referenceReadyGate.attemptId
  const child=await db.assessment.findFirstOrThrow({where:{compositeAttemptId:attemptId}})
  const denied=await request(`/scales/assessments/${child.id}`,'GET',undefined,409)
  assert.equal(denied.code,'STALE_ATTEMPT')
  const parent=await db.compositeAssessmentAttempt.findUniqueOrThrow({where:{id:attemptId}})
  assert.equal(parent.status,'IN_PROGRESS');assert.equal(parent.contextSnapshotHash,null);assert.equal(parent.trainingReferenceBindingHash,null)
  assert.equal(child.status,'IN_PROGRESS');assert.equal(child.submissionId,null)
  assert.equal(await db.assessmentUnitSnapshot.count({where:{compositeAttemptId:attemptId}}),0)
  assert.equal(await db.compositeFormAnswer.count({where:{attemptId}}),0)
  fixture.referenceReadyGate.passed=true;save();result.passed=true
  result.check='Direct Scale runner GET cannot bypass pending context/reference selection, with no accepted fact or binding written'
  console.log('PASS',result.check)
}catch(error){result.error={name:error.name,message:error.message};console.error(error);process.exitCode=1}
finally{
  fs.writeFileSync(path.join(state,'training-reference-ready-result.json'),JSON.stringify(result,null,2),{mode:0o600})
  await db.$disconnect()
}
