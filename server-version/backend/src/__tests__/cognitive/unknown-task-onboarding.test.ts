import { afterEach, describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { compileCognitiveRuntime } from '../../modules/assessment-runtime/compiler'
import { projectThreeLayerReport } from '../../modules/cognitive/v2/report'
import { validateTaskDefinition } from '../../modules/cognitive/v2/publication-gate'
import { listCognitiveRegistryEntries } from '../../modules/cognitive/cognitive.registry'
import type { RegistryEntry } from '../../modules/cognitive/cognitive.types'
const require=createRequire(import.meta.url)
const {ROOT,discover,generate,projections}=require('../../../../scripts/cognitive/manifests.cjs')
const {guard}=require('../../../../scripts/cognitive/dependencies.cjs')
const {classifyChangedPath}=require('../../../../scripts/cognitive/content-policy.cjs')
const taskRoot='server-version/backend/src/__tests__/cognitive/fixtures/onboarding'
const cleanup: string[]=[]
afterEach(()=>{for(const p of cleanup.splice(0))rmSync(p,{recursive:true,force:true})})
function sandbox(){
 const root=mkdtempSync(resolve(tmpdir(),'cognitive-package-negative-'));cleanup.push(root)
 const fixture=resolve(ROOT,taskRoot,'TEST_ONBOARDING_UNKNOWN_V1'),dir=resolve(root,'tasks/TEST_ONBOARDING_UNKNOWN_V1')
 mkdirSync(dir,{recursive:true});cpSync(fixture,dir,{recursive:true})
 const file=resolve(dir,'task-package.json'),descriptor=JSON.parse(readFileSync(file,'utf8'))
 cpSync(resolve(ROOT,descriptor.frontend[0].file),resolve(dir,'runner.ts'))
 descriptor.frontend[0].file='tasks/TEST_ONBOARDING_UNKNOWN_V1/runner.ts'
 writeFileSync(file,JSON.stringify(descriptor))
 return {root,dir,file,descriptor,options:{root,taskRoot:'tasks',back:'generated/backend',front:'generated/frontend'}}
}

describe('zero-core unknown task structural onboarding',()=>{
 it('uses production discovery, generated modules, adapter, scorer, protocol and report without registering the fixture',async()=>{
  const packages=discover(ROOT,taskRoot)
  expect(packages.map((p: { task: string })=>p.task)).toEqual(['TEST_ONBOARDING_UNKNOWN_V1'])
  expect(guard(ROOT,packages)).toBeGreaterThan(0)
  const output=mkdtempSync(resolve(process.cwd(),'.cognitive-fixture-'));cleanup.push(output)
  const base=relative(ROOT,output).split('\\').join('/')
  const outputs=projections(packages,`${base}/backend`,`${base}/frontend`)
  for(const [file,content] of outputs){mkdirSync(resolve(ROOT,file,'..'),{recursive:true});writeFileSync(resolve(ROOT,file),content)}
  const {cognitiveExecutionEntries}=await import(resolve(output,'backend/execution.ts'))
  const {cognitiveRunnerEntries}=await import(resolve(output,'frontend/runners.ts'))
  const {cognitivePresentations}=await import(resolve(output,'backend/presentation.ts'))
  const {cognitiveSeeds}=await import(resolve(output,'backend/seeds.ts'))
  const {cognitiveCatalog}=await import(resolve(output,'backend/catalog.ts'))
  const entry=cognitiveExecutionEntries[0] as RegistryEntry<unknown,unknown>,definition=buildCognitiveV2TaskDefinition(entry)
  expect(cognitiveRunnerEntries[0].testType).toBe(entry.testType)
  expect(typeof cognitiveRunnerEntries[0].RunnerComponent).toBe('function')
  expect(cognitiveCatalog[entry.testType].testType).toBe(entry.testType)
  expect(validateTaskDefinition(definition).filter(i=>i.severity==='error')).toEqual([])
  const config=definition.configSchema.parse(cognitiveSeeds[0].config)
  const scored=definition.scorer({config,trials:[{trialIndex:0,payload:{correct:true}}] as never,randomSeed:'fixture'})
  expect(definition.protocol.phases.map(p=>p.key)).toEqual(['learning','delayed'])
  expect(scored.metrics.correctCount).toBe(1)
  expect(scored.quality.state).toBe('interpretable')
  const empty=definition.scorer({config,trials:[],randomSeed:'fixture'})
  expect(empty.quality.state).toBe('invalid')
  expect(compileCognitiveRuntime({definition}).instrumentKey).toBe(entry.testType)
  const report=projectThreeLayerReport({...entry,configVersion:'1.0.0',protocolSignature:'fixture',profile:'standard',definition:definition.report,metricDefinitions:definition.metrics,qualityDefinitions:definition.quality,metrics:scored.metrics,score:scored,participantPresentation:cognitivePresentations[0]})
  expect(report.headline[0].participantLabel).toBe('Unknown successes')
  expect(report.headline[0].explanation).toBe('Task-specific successes')
  expect(listCognitiveRegistryEntries().some(e=>e.testType===entry.testType)).toBe(false)
 })
 it('is deterministic and rejects hand-edited generated projections',()=>{
  const {options,root}=sandbox()
  const first=generate(options).outputs
  expect(generate(options).outputs).toEqual(first)
  expect(()=>generate({...options,check:true})).not.toThrow()
  writeFileSync(resolve(root,'generated/backend/execution.ts'),'// drift')
  expect(()=>generate({...options,check:true})).toThrow('COG_MANIFEST_DRIFT')
 })
 it.each([
  ['COG_IDENTITY_DUPLICATE',(d:any)=>d.identities.push({...d.identities[0]})],
  ['COG_RUNNER_DUPLICATE',(d:any)=>d.frontend.push({...d.frontend[0]})],
  ['COG_RUNNER_MISSING',(d:any)=>d.identities.push({...d.identities[0],engineVersion:'2.0.0'})],
  ['COG_PACKAGE_PATH_INVALID',(d:any)=>d.backend.file='../escape.ts'],
  ['COG_PACKAGE_EXPORT_INVALID',(d:any)=>d.backend.export='absent'],
  ['COG_CATALOG_MISSING',(d:any)=>delete d.catalog],
  ['COG_PRESENTATION_MISSING',(d:any)=>delete d.presentation],
 ])('rejects %s with a stable code',(code,mutate)=>{
   const s=sandbox();mutate(s.descriptor);writeFileSync(s.file,JSON.stringify(s.descriptor))
   expect(()=>generate(s.options)).toThrow(code)
 })
 it('allows multiple scorer versions sharing an unambiguous runner binding',()=>{
  const s=sandbox();s.descriptor.identities.push({...s.descriptor.identities[0],scoringVersion:'2.0.0'});writeFileSync(s.file,JSON.stringify(s.descriptor))
  expect(discover(s.root,'tasks')[0].runners).toHaveLength(1)
 })
 it.each(['forbidden','cycle'])('rejects actual %s imports',(mode)=>{
   const s=sandbox()
   const extra=mode==='cycle'?'./cycle':'./governance'
   writeFileSync(resolve(s.dir,'package.ts'),`import '${extra}'\nexport const executionEntries=[]\n`)
   if(mode==='cycle')writeFileSync(resolve(s.dir,'cycle.ts'),"import './package'\n")
   expect(()=>guard(s.root,discover(s.root,'tasks'))).toThrow(mode==='cycle'?'COG_DEPENDENCY_CYCLE':'COG_DEPENDENCY_FORBIDDEN')
 })
 it('fails closed on shared or unrecognized content paths',()=>{
  const packages=discover()
  expect(classifyChangedPath('server-version/backend/src/modules/cognitive/tasks/flanker/definitions.ts',packages)).toBe('TASK_OWNED')
  expect(classifyChangedPath('server-version/backend/src/modules/cognitive/generated/execution.ts',packages)).toBe('GENERATED')
  expect(classifyChangedPath('server-version/backend/src/modules/cognitive/tasks/flanker/tests/boundary.ts',packages)).toBe('TEST')
  for(const file of ['server-version/backend/src/modules/cognitive/cognitive.registry.ts','server-version/frontend/src/modules/cognitive/tasks/shared/prng.ts','server-version/backend/src/modules/cognitive/generated/forged.ts','server-version/backend/src/modules/cognitive/tasks/flanker/../cognitive.registry.ts','.github/workflows/ci.yml'])expect(classifyChangedPath(file,packages)).toBe('SHARED_CORE')
 })
})
