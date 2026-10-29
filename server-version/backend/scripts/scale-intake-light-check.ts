import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { inspectScaleContent } from './scale-onboarding-check.mjs'
import { parseScaleInstrumentSourceSchema } from '../src/modules/scale/onboarding/schema'
import { validateScaleInstrumentSource } from '../src/modules/scale/onboarding/validate-instrument'
import { evaluateScaleProductReadiness } from '../src/modules/scale/library/product-readiness'
import { projectScalePackage } from '../src/modules/scale/onboarding/define-instrument'
import { buildScaleResult, parseScaleResultV2 } from '../src/modules/scale/scale-result'

const main=async()=>{
const repo=resolve(process.cwd(),'../..')
const base=process.env.SCALE_LIGHT_BASE_SHA ?? ''
const head=process.env.SCALE_LIGHT_HEAD_SHA ?? ''
assert.match(base,/^[0-9a-f]{40}$/)
assert.match(head,/^[0-9a-f]{40}$/)
assert.equal(execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),head)
const changed=execFileSync('git',['diff','--name-only','-z','--no-renames',base,head],{cwd:repo,encoding:'utf8'}).split('\0').filter(Boolean)
const pattern=/^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/([0-9]+\.[0-9]+\.[0-9]+)\/instrument\.ts$/
const changedSources=changed.filter(file=>pattern.test(file))
assert.ok(changedSources.length>0,'No changed instrument sources')
const outcome=[]
for(const file of changedSources) {
 const match=pattern.exec(file)
 assert.ok(match)
 const itemText=readFileSync(resolve(repo,file),'utf8')
 const lint=inspectScaleContent(file.replace(/^server-version\/backend\//,''),itemText)
 assert.deepEqual(lint,[],'Unsafe instrument declaration: '+file)
 const mod=await import(pathToFileURL(resolve(repo,file)).href)
 const source=parseScaleInstrumentSourceSchema(mod.SCALE_INSTRUMENT_SOURCE)
 assert.equal(source.identity.instrumentKey,match[1])
 assert.equal(source.identity.instrumentVersion,match[2])
 const reviewed=validateScaleInstrumentSource(source)
 assert.equal(reviewed.valid,true,JSON.stringify({file,issues:reviewed.issues}))
 const meta: {key:string;version:string;sha256:string;catalog:true;status?:string;references?:number;golden?:number;measurement?:string;report?:string}={key:source.identity.instrumentKey,version:source.identity.instrumentVersion,sha256:createHash('sha256').update(itemText).digest('hex'),catalog:true}
 if(!source.executable) {
  assert.equal(source.candidatePreview?.status,'CATALOG_ONLY','Catalog candidate must declare explicit status')
  assert.ok((source.candidatePreview?.blockers?.length??0)>0,'Catalog-only source must list blockers')
  assert.ok((source.candidatePreview?.reportPlan?.limitations.length??0)>0,'Catalog-only report plan required')
  meta.status='CATALOG_ONLY'
  meta.references=0
  meta.golden=0
  outcome.push(meta)
  continue
 }
 const exec=source.executable
 assert.equal(exec.releaseStatus,'DRAFT','Light intake does not grant publication eligibility')
 const pkg=projectScalePackage(source)
 assert.ok(pkg,'Missing executable projection')
 const readiness=evaluateScaleProductReadiness(pkg)
 assert.equal(readiness.ready,true,'Draft executable product contract invalid: '+JSON.stringify(readiness))
 assert.ok(exec.goldenCases.length>0,'Executable source needs golden cases')
 if(exec.definition.referencePolicy.type==='none') assert.deepEqual(exec.references,[])
 for (const fixture of exec.goldenCases) {
  const report=parseScaleResultV2(buildScaleResult({
   scaleId:'ci-'+source.identity.instrumentKey,
   instrumentKey:source.identity.instrumentKey,
   name:source.catalog.identity.canonicalName,
   instrumentVersion:source.identity.instrumentVersion,
   definition:exec.definition,
   answers:fixture.answers,
   referenceSets:exec.references
  }))
  assert.equal(report.quality.status,fixture.expected.quality,fixture.name+': quality')
  assert.deepEqual(report.scores.map(score=>score.key),fixture.expected.totalScoreKeys,fixture.name+': score keys')
  for(const [key,expected] of Object.entries(fixture.expected.scores))
   assert.equal(report.scores.find(score=>score.key===key)?.value,expected,fixture.name+': '+key)
  assert.equal(report.method.scoringVersion,exec.definition.scoring.scoringVersion)
  assert.equal(report.method.reportVersion,exec.definition.report.reportVersion)
  if(exec.definition.referencePolicy.type==='none') {
   assert.deepEqual(report.references,[],'No ungrounded reference/percentile')
   assert.deepEqual(report.method.referenceVersions,[])
   assert.ok(report.interpretations.every(i=>i.referenceVersion===null && i.label===null))
  }
  if(fixture.expected.quality==='interpretable')assert.ok(report.interpretations.length>0,'Valid response must generate descriptive interpretations')
 }
 const sample=exec.goldenCases.find(c=>c.expected.quality==='interpretable')
 const canonical=exec.definition.scoring.scores.find(score=>score.canonical && score.source.type==='items')
 if(sample && canonical && canonical.source.type==='items' && exec.definition.scoring.defaultMissingPolicy.type==='complete_required') {
  const removed=canonical.source.items[0]?.itemCode
  assert.ok(removed)
  const report=parseScaleResultV2(buildScaleResult({
   scaleId:'ci-'+source.identity.instrumentKey,
   instrumentKey:source.identity.instrumentKey,
   name:source.catalog.identity.canonicalName,
   instrumentVersion:source.identity.instrumentVersion,
   definition:exec.definition,
   answers:sample.answers.filter(a=>a.itemCode!==removed),
   referenceSets:exec.references
  }))
  assert.equal(report.quality.status,'invalid','Incomplete canonical score must be invalid')
  assert.equal(report.scores.find(score=>score.key===canonical.key)?.value,null,'Missing score cannot be silently zero')
  assert.deepEqual(report.interpretations,[],'Invalid answers must have no individual interpretations')
  assert.deepEqual(report.references,[],'Invalid answers must not get norms')
 }
 meta.status='DRAFT'
 meta.golden=exec.goldenCases.length
 meta.references=exec.references.length
 meta.measurement=exec.definition.scoring.scoringVersion
 meta.report=exec.definition.report.reportVersion
 outcome.push(meta)
}
console.log(JSON.stringify({status:'SCALE_INTAKE_LIGHT_PASSED',base,head,checked:outcome.length,results:outcome}))

}
main().catch(error=>{console.error(error);process.exitCode=1})
