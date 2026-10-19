/** Synthetic, service-free compatibility checks for the resume audit codec.
 * Only the two pinned, built-ins-only dist modules below are loaded. No
 * application runtime, private execution runtime or database is imported. */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createRequire} from 'node:module'
import {fileURLToPath} from 'node:url'
import {createHash,createCipheriv,randomBytes} from 'node:crypto'
import {gzipSync} from 'node:zlib'
import {spawnSync} from 'node:child_process'
import test from 'node:test'
import {CIPHERTEXT_PROOF_JS} from './c25-analysis-resume-db.mjs'

const directory=path.dirname(fileURLToPath(import.meta.url))
const backend=path.resolve(directory,'../../backend')
const sha=bytes=>createHash('sha256').update(bytes).digest('hex')

/** Include these exact paths in the outer runner's before/after input binding.
 * Source counterparts document the frozen codec; only the .js files execute. */
export const CONSUMED_FROZEN_CODE=Object.freeze([
 {path:path.join(backend,'dist/modules/assessment-runtime/compact-field-codec.js'),sha256:'360aac17536f525c509e7d678ee2080a290514f4d92cd6daac5e3233c1a0403f'},
 {path:path.join(backend,'dist/modules/assessment-runtime/canonical.js'),sha256:'352f09bb01674c16d9ba19c2c2dee816657a07bb944eb054090426f56b9816ce'},
 {path:path.join(backend,'src/modules/assessment-runtime/compact-field-codec.ts'),sha256:'61fede51c449e1f2a84a2bcc5485ec5fdd149cc72e70f5ecd0d0c2c24bfb24c7'},
 {path:path.join(backend,'src/modules/assessment-runtime/canonical.ts'),sha256:'e469eb794eadd6596cb0c4531dd6b6b256c8c176eac657ee20d5982f8e217066'},
].map(Object.freeze))
export const CONSUMED_AUDIT_FILES=Object.freeze([
 'c25-analysis-resume-compact.test.mjs','c25-analysis-resume-db.mjs','c25-analysis-db.mjs',
 'c25-missing-db.mjs','c25-analysis-resume-contract.mjs','c25-analysis-contract.mjs','c25-missing-contract.mjs',
].map(name=>path.join(directory,name)))

function assertFrozenCode(){
 for(const binding of CONSUMED_FROZEN_CODE){
  const info=fs.lstatSync(binding.path);assert.ok(info.isFile()&&!info.isSymbolicLink())
  assert.equal(sha(fs.readFileSync(binding.path)),binding.sha256,'Frozen codec input changed: '+path.basename(binding.path))
 }
}
assertFrozenCode()
for(const binding of CONSUMED_FROZEN_CODE.filter(row=>row.path.endsWith('.js'))){
 const source=fs.readFileSync(binding.path,'utf8')
 const requires=[...source.matchAll(/\brequire\(["']([^"']+)["']\)/g)].map(match=>match[1])
 assert.ok(requires.length>0&&requires.every(name=>['node:crypto','node:zlib'].includes(name)),'Codec must stay built-ins-only')
 assert.doesNotMatch(source,/\bimport\s*\(/)
}
const require=createRequire(import.meta.url)
const previousCache=new Set(Object.keys(require.cache))
const {encryptCompactField,decryptCompactField}=require(CONSUMED_FROZEN_CODE[0].path)
const {canonicalHash,canonicalJsonBytes}=require(CONSUMED_FROZEN_CODE[1].path)
const expectedCache=new Set(CONSUMED_FROZEN_CODE.slice(0,2).map(row=>row.path))
assert.ok(Object.keys(require.cache).filter(file=>!previousCache.has(file)).every(file=>expectedCache.has(file)))

function withFixture(operation){
 assertFrozenCode()
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'c25-resume-compact-'))
 const oldKey=process.env.DATA_ENCRYPTION_KEY
 // Deliberately synthetic; no existing runtime or user secret is read.
 const key=Buffer.alloc(32,0x37),runtime=path.join(temporary,'synthetic-runtime.json')
 process.env.DATA_ENCRYPTION_KEY=key.toString('hex')
 fs.writeFileSync(runtime,JSON.stringify({DATA_ENCRYPTION_KEY:key.toString('hex')}),{flag:'wx',mode:0o600})
 const encryptLegacy=value=>{
  const iv=randomBytes(16),cipher=createCipheriv('aes-256-gcm',key,iv)
  const body=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()])
  return [iv,cipher.getAuthTag(),body].map(bytes=>bytes.toString('hex')).join(':')
 }
 const input={cases:[],templates:[],scaleFacts:[],newTemplateHashes:[]},reports={}
 for(const name of ['MA','SA','MB']){
  const evidence={schemaVersion:1,attemptId:'attempt-'+name,attemptEpoch:1,compositeId:'task-'+name,
   slotSetHash:'a'.repeat(64),contextSnapshotHash:'b'.repeat(64),configDigest:'c'.repeat(64),
   snapshotHeadersDigest:'d'.repeat(64),path:{termination:name==='SA'?'SCREEN_OUT':'COMPLETE',
    taskSatisfaction:name==='SA'?'NOT_SATISFIED':'SATISFIED',acceptedInstrumentKeys:['accepted-'+name],
    retainedSyntheticLabel:'相同的冻结路径。'.repeat(100)}}
  const parent={id:'attempt-'+name,attempt_epoch:1,composite_assessment_id:'task-'+name,
   frozen_active_slot_set_hash:'a'.repeat(64),context_snapshot_hash:'b'.repeat(64),aggregate_input_hash:canonicalHash({accepted:name}),
   training_flow_path_hash:canonicalHash(evidence),training_flow_path_encrypted:encryptCompactField({schemaVersion:1,value:evidence})}
  const before={...parent,training_flow_path_encrypted:encryptCompactField({schemaVersion:1,value:evidence})}
  assert.notEqual(before.training_flow_path_encrypted,parent.training_flow_path_encrypted)
  assert.deepEqual(decryptCompactField(before.training_flow_path_encrypted),decryptCompactField(parent.training_flow_path_encrypted))
  assert.match(parent.training_flow_path_encrypted,/^ekc1:gz:/)
  const binding={attemptId:parent.id,attemptEpoch:1,slotSetHash:parent.frozen_active_slot_set_hash,
   contextHash:parent.context_snapshot_hash,aggregateInputHash:parent.aggregate_input_hash}
  const item={name,before,parent,scales:[],job:{report_encrypted:null}}
  if(name==='SA'){
   const content={report:{id:parent.id,unitReports:[],backgroundValues:[{label:'已筛出，仅保留表单事实。'.repeat(200)}]},policies:[]}
   const envelope={schemaVersion:1,binding,...content,contentHash:canonicalHash(content)}
   const plain=Buffer.from(JSON.stringify(envelope))
   const packed={schemaVersion:2,codec:'gzip-json-v1',plainBytes:plain.length,plainSha256:sha(plain),payload:gzipSync(plain,{level:1}).toString('base64')}
   assert.ok(Buffer.byteLength(JSON.stringify(packed))<plain.length)
   reports[name]={envelope,packed};item.job.report_encrypted=encryptLegacy(packed)
  }else{
   const assessmentId='scale-'+name,sourceResultHash=canonicalHash({source:name})
   item.scales=[{id:assessmentId}]
   input.scaleFacts.push({assessment_id:assessmentId,attempt_epoch:1,source_result_hash:sourceResultHash})
   const value={version:1,root:{assessmentId:parent.composite_assessment_id,name:'冻结量表 '+name,productKind:'QUESTIONNAIRE',reportMode:'COLLECTION_ONLY'},
    units:[{itemId:'item-'+name,type:'SCALE',kind:'scale',scaleId:'original-scale',scaleCode:'original-code',
     scaleName:'原量表',scaleProjectionPolicy:{schemaVersion:1,allowedMetrics:['total'],description:'允许的既有布局。'.repeat(40)}}]}
   const templateHash=canonicalHash({storageVersion:1,kind:'COMPOSITE_REPORT_LAYOUT',value})
   const template={template_hash:templateHash,template_kind:'COMPOSITE_REPORT_LAYOUT',plaintext_bytes:canonicalJsonBytes(value).length,
    payload_encrypted:encryptCompactField({version:1,kind:'COMPOSITE_REPORT_LAYOUT',value}),created_at:'2026-10-19T12:00:01.000'}
   input.templates.push(template);input.newTemplateHashes.push(templateHash)
   const manifest={kind:'COMPOSITE_REPORT_FACTS',version:1,binding,layout:templateHash,
    personal:{id:parent.id,trainingFlow:{pathHash:parent.training_flow_path_hash},completedAt:'2026-10-19T12:00:00.123Z'},
    units:[{assessmentId,sourceResultHash}]}
   reports[name]={manifest,templateValue:value};item.job.report_encrypted=encryptCompactField(manifest)
   assert.match(item.job.report_encrypted,/^ekc1:gz:/);assert.match(template.payload_encrypted,/^ekc1:gz:/)
  }
  input.cases.push(item)
 }
 const run=value=>spawnSync(process.execPath,['--input-type=module','-e',CIPHERTEXT_PROOF_JS,runtime],{
  input:JSON.stringify(value),encoding:'utf8',timeout:10000,maxBuffer:1024*1024,
 })
 const reject=(label,mutate)=>{
  const altered=structuredClone(input);mutate(altered)
  const result=run(altered);assert.equal(result.error,undefined,label);assert.equal(result.signal,null,label)
  assert.notEqual(result.status,0,label+' unexpectedly accepted')
  assert.equal(result.stdout,'',label+' printed a success proof')
 }
 try{return operation({input,reports,run,reject,encryptLegacy})}
 finally{
  if(oldKey===undefined)delete process.env.DATA_ENCRYPTION_KEY;else process.env.DATA_ENCRYPTION_KEY=oldKey
  fs.rmSync(temporary,{recursive:true,force:true});assertFrozenCode()
 }
}

test('frozen production compact codecs generate MA/MB manifests and layouts plus SA compressed legacy report accepted by the independent proof',()=>{
 withFixture(({input,run})=>{
  const result=run(input);assert.equal(result.error,undefined);assert.equal(result.signal,null);assert.equal(result.status,0,result.stderr)
  assert.deepEqual(JSON.parse(result.stdout),{authenticatedReports:3,unchangedDecryptedPaths:3,newReferencedTemplates:2})
  assert.equal(input.templates.length,2);assert.equal(input.scaleFacts.length,2)
 })
})

test('production uncompressed ekc1 js path envelopes also survive randomized ciphertext changes',()=>{
 withFixture(({input,run})=>{
  for(const item of input.cases){
   const value=0,envelope={schemaVersion:1,value}
   item.parent.training_flow_path_hash=item.before.training_flow_path_hash=canonicalHash(value)
   item.parent.training_flow_path_encrypted=encryptCompactField(envelope)
   item.before.training_flow_path_encrypted=encryptCompactField(envelope)
   assert.match(item.parent.training_flow_path_encrypted,/^ekc1:js:/)
   assert.notEqual(item.parent.training_flow_path_encrypted,item.before.training_flow_path_encrypted)
  }
  const result=run(input);assert.equal(result.status,0,result.stderr)
  assert.deepEqual(JSON.parse(result.stdout),{authenticatedReports:3,unchangedDecryptedPaths:3,newReferencedTemplates:2})
 })
})

test('malformed compact data, authentication failures and authenticated path/report/template hash changes fail closed',()=>{
 withFixture(({reports,reject,encryptLegacy})=>{
  reject('malformed compact encoding',value=>{value.cases[0].parent.training_flow_path_encrypted='ekc1:gz:not-a-valid-header'})
  reject('compact authentication tag mismatch',value=>{
   const parts=value.cases[0].job.report_encrypted.split(':'),body=Buffer.from(parts[5],'base64')
   body[12]^=1;parts[5]=body.toString('base64');value.cases[0].job.report_encrypted=parts.join(':')
  })
  reject('compact declared length mismatch',value=>{
   const parts=value.cases[0].parent.training_flow_path_encrypted.split(':');parts[3]=String(Number(parts[3])+1)
   value.cases[0].parent.training_flow_path_encrypted=parts.join(':')
  })
  reject('same forged path still mismatches retained canonical hash',value=>{
   const cipher=encryptCompactField({schemaVersion:1,value:{changed:true}})
   value.cases[0].parent.training_flow_path_encrypted=cipher;value.cases[0].before.training_flow_path_encrypted=cipher
  })
  reject('different authenticated path plaintext',value=>{
   value.cases[0].parent.training_flow_path_encrypted=encryptCompactField({schemaVersion:1,value:{changed:true}})
  })
  reject('report binding hash mismatch',value=>{
   const manifest=structuredClone(reports.MA.manifest);manifest.binding.aggregateInputHash='f'.repeat(64)
   value.cases[0].job.report_encrypted=encryptCompactField(manifest)
  })
  reject('authenticated template body hash mismatch',value=>{
   const body=structuredClone(reports.MA.templateValue);body.root.name='changed'
   value.templates[0].payload_encrypted=encryptCompactField({version:1,kind:'COMPOSITE_REPORT_LAYOUT',value:body})
   value.templates[0].plaintext_bytes=canonicalJsonBytes(body).length
  })
  reject('template byte count mismatch',value=>{value.templates[0].plaintext_bytes++})
  reject('authenticated compressed legacy digest mismatch',value=>{
   value.cases[1].job.report_encrypted=encryptLegacy({...reports.SA.packed,plainSha256:'f'.repeat(64)})
  })
  reject('authenticated legacy content hash mismatch',value=>{
   const envelope={...reports.SA.envelope,contentHash:'f'.repeat(64)},plain=Buffer.from(JSON.stringify(envelope))
   value.cases[1].job.report_encrypted=encryptLegacy({schemaVersion:2,codec:'gzip-json-v1',plainBytes:plain.length,
    plainSha256:sha(plain),payload:gzipSync(plain).toString('base64')})
  })
 })
})

test('compact report references cannot select unrelated templates, attempts or accepted scale fact hashes',()=>{
 withFixture(({reports,reject})=>{
  reject('missing referenced template',value=>{value.templates.shift()})
  reject('unreferenced appended template',value=>{value.newTemplateHashes.push('f'.repeat(64))})
  reject('wrong report layout reference',value=>{
   const manifest={...reports.MA.manifest,layout:'f'.repeat(64)};value.cases[0].job.report_encrypted=encryptCompactField(manifest)
  })
  reject('wrong accepted scale hash',value=>{value.scaleFacts[0].source_result_hash='f'.repeat(64)})
  reject('missing accepted scale fact',value=>{value.scaleFacts.shift()})
  reject('wrong source attempt reference',value=>{
   const manifest=structuredClone(reports.MA.manifest);manifest.units[0].assessmentId='unrelated-assessment'
   value.cases[0].job.report_encrypted=encryptCompactField(manifest)
  })
  reject('wrong parent in report personal fields',value=>{
   const manifest=structuredClone(reports.MA.manifest);manifest.personal.id='unrelated-parent'
   value.cases[0].job.report_encrypted=encryptCompactField(manifest)
  })
 })
})
