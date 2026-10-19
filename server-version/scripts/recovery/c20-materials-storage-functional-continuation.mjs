/** Read-only exact storage evidence; preserves the prior invalid cipher-equality assertion. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {gzipSync} from 'node:zlib'
import {harness,prisma,candidateProof,census,sha} from './c20-materials-client.mjs'
const h=harness('storage-functional');let error
const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort())
function codecEvidence(candidate,cipher){
 const plain=Buffer.from(JSON.stringify({schemaVersion:1,value:candidate})),match=/^ekc1:(gz|js):([a-f0-9]{16}):([1-9][0-9]*):([a-f0-9]{64}):([A-Za-z0-9+/]+={0,2})$/.exec(cipher);assert.ok(match)
 const packed=gzipSync(plain,{level:1,chunkSize:Math.max(64,Math.min(16*1024,plain.length+64)),...(plain.length<=4096?{windowBits:12,memLevel:4}:{})})
 const codec=packed.length<plain.length?'gz':'js',payloadBytes=codec==='gz'?packed.length:plain.length
 assert.equal(match[1],codec);assert.equal(Number(match[3]),plain.length);assert.equal(match[4],sha(plain))
 const header=cipher.slice(0,cipher.length-match[5].length),formula=Buffer.byteLength(header)+4*Math.ceil((12+16+payloadBytes)/3)
 assert.equal(Buffer.from(match[5],'base64').length,28+payloadBytes);assert.equal(Buffer.byteLength(cipher),formula)
 return {codec,envelopePlainBytes:plain.length,gzipBytes:packed.length,payloadBytes,headerBytes:Buffer.byteLength(header),ivBytes:12,tagBytes:16,formulaCipherBytes:formula,actualCipherBytes:Buffer.byteLength(cipher)}
}
function normalize(candidate){
 const copy=structuredClone(candidate)
 for(const field of ['compositeId','attemptId','publishedAt','flowDigest','slotSetHash'])copy[field]='NORMALIZED_'+field
 for(const field of ['claimId','experimentId','compositeId','publicationKey','configDigest','participantKey','attemptId','groupKey','assignmentHash'])copy.materialAssignment[field]='NORMALIZED_'+field
 return copy
}
try{
 const priorFile=path.join(h.state,'c20-cost-result.json'),journalFile=path.join(h.state,'c20-cost-http-private.jsonl')
 assert.equal(sha(fs.readFileSync(priorFile)),'bcba3893df12d893004db0e2c91a93138bb7fe30118c31876f138824de27b2f3')
 assert.equal(sha(fs.readFileSync(journalFile)),'1c59d5caf55f7904d02ecb1266eb6b8bfe0cf0cf40eb482f175b0524401995a8')
 const prior=h.read('c20-cost-result.json');assert.equal(prior.passed,false);assert.match(prior.error.message,/911 !== 919/)
 assert.deepEqual(prior.measurements.map(m=>m.label),['cold_first_claim','warm_recovery','warm_existing_start','restart_same_claim','linked_new_publication','full_quota_denial'])
 h.result.priorProducer={runtimeSha256:'14aff9859ce69b8c4358b4dd3fd012e1e00946725943971fe4d29359c7c8fdb4',resultSha256:'bcba3893df12d893004db0e2c91a93138bb7fe30118c31876f138824de27b2f3',continuation:'Read existing storage candidates and original path responses; exact production gzip/header/base64 formula, explicit identity normalization. Preserve all six prior SQL observations and failed cipher equality without rerunning admissions.'}
 const before=await census(),journal=fs.readFileSync(journalFile,'utf8').trim().split('\n').map(line=>JSON.parse(line)),responses=journal.filter(r=>r.stage==='RECEIVED'&&r.response!=='AUTH_REDACTED').map(r=>{try{return JSON.parse(r.response).data}catch{return null}}).filter(Boolean)
 const records=[],normalized=[]
 for(const [count,id] of [[2,'98cbf6e0-c41c-4ddf-9879-2cdd2711838f'],[8,'b2b0c355-c9e0-42d5-9e9f-79ae04c0da8a']]){
  const proof=await candidateProof(id),c=proof.candidate,a=c.materialAssignment,product=await prisma.compositeAssessment.findUniqueOrThrow({where:{id:proof.row.compositeAssessmentId}}),config=product.trainingFlowFrozen
  keys(c,['schemaVersion','compositeId','publishedAt','attemptId','attemptEpoch','flowDigest','references','assignments','situational','materialAssignment','slotSetHash'])
  keys(a,['schemaVersion','claimId','experimentId','compositeId','publicationKey','configDigest','participantKey','attemptId','attemptEpoch','groupKey','materialDigest','algorithm','assignmentHash'])
  assert.deepEqual(c.references,{});assert.deepEqual(c.assignments,{});assert.deepEqual(c.situational,{});assert.equal(c.schemaVersion,2);assert.equal(a.schemaVersion,1)
  assert.equal(config.experiment.groups.length,count);assert.equal(config.experiment.linkedPolicy,'RERANDOMIZE')
  for(const group of config.experiment.groups){assert.equal(group.materialTitle,'Same title');assert.equal(group.materialBody,'x'.repeat(8000));assert.equal(group.groupKey.length,1)}
  const body=JSON.stringify(c);assert.ok(!body.includes('materialBody')&&!body.includes('materialTitle')&&!body.includes('groups')&&!body.includes('x'.repeat(100)))
  const original=responses.find(r=>r.attempt?.id===id);assert.ok(original)
  const materials=original.attempt.trainingFlow.materials;assert.equal(materials.length,1);assert.equal(materials[0].blockKey,'assigned_material');assert.equal(materials[0].title,'Same title');assert.equal(materials[0].body,'x'.repeat(8000))
  assert.equal(original.attempt.trainingFlow.termination,'PENDING');assert.equal(proof.proof,null)
  assert.equal(await prisma.trainingMaterialAllocationClaim.count({where:{compositeId:product.id}}),1)
  const buckets=await prisma.trainingMaterialQuotaBucket.findMany({where:{compositeId:product.id}});assert.equal(buckets.length,count);assert.equal(buckets.reduce((n,b)=>n+b.assignedCount,0),1)
  const codec=codecEvidence(c,proof.row.trainingFlowSnapshotEncrypted)
  records.push({groupCount:count,attemptId:id,configBytes:Buffer.byteLength(JSON.stringify(config)),candidatePlainBytes:Buffer.byteLength(body),...codec})
  normalized.push(normalize(c))
 }
 assert.equal(records[0].candidatePlainBytes,records[1].candidatePlainBytes)
 assert.ok(records[1].configBytes>records[0].configBytes+40000)
 assert.deepEqual(records.map(r=>r.actualCipherBytes),[919,911])
 assert.deepEqual(normalized[0],normalized[1],'only explicitly enumerated identity/hash fields may differ; materialDigest and all structural fields remain exact')
 assert.deepEqual(await census(),before)
 h.result.storage=records;h.result.normalizedCandidateSha256=sha(JSON.stringify(normalized[0]));h.result.reusedSqlObservations=prior.measurements
 h.result.interpretation='Equal candidate plaintext structure/length, no candidate material bodies. Per-record production gzip length fully explains 919/911 cipher bytes; ciphertext equality across independent random identities was an invalid harness assumption. No tolerance or capacity qualification.'
 h.check('Existing 2/8 admissions have exact candidate keys and empty tool refs, selected-only equal material path, equal plaintext length, and exact per-record compact-codec size formula')
 h.check('Explicit identity/hash normalization preserves all other candidate fields exactly; original six SQL observations and both original failures retained')
 h.result.passed=true
}catch(e){error=e;throw e}finally{await h.finish(error)}
