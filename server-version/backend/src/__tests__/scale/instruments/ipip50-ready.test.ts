import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseScaleInstrumentSourceSchema } from '../../../modules/scale/onboarding/schema'
import { describe, expect, it, vi } from 'vitest'
import { SCALE_INSTRUMENT_SOURCE as source } from '../../../modules/scale/instruments/ipip50_zh_cn_research/1.1.0/instrument'
import { projectScalePackage } from '../../../modules/scale/onboarding/define-instrument'
import { getScaleInstrumentRuntimePolicy } from '../../../modules/scale/onboarding/instrument-registry'
import { validateScaleInstrumentSource } from '../../../modules/scale/onboarding/validate-instrument'
import { getScalePackage, validateScalePackage } from '../../../modules/scale/scale-package.registry'
import { evaluateScaleProductReadiness } from '../../../modules/scale/library/product-readiness'
import { evaluateScaleSourceScientificQualification } from '../../../modules/scale/library/scientific-qualification'
import { scoreScale } from '../../../modules/scale/scale-scoring'
import { runnerDefinition } from '../../../modules/scale/scale-definition'
import { buildScaleResult } from '../../../modules/scale/scale-result'
import { projectScaleResult } from '../../../modules/scale/projection/scale-result.projector'
import { DISCLOSURE_PRESETS } from '../../../modules/scale/policy/disclosure'
import { evaluateInstrumentEligibility } from '../../../modules/scale/policy/eligibility'
import { planScaleInstrumentInstall } from '../../../modules/scale/onboarding/install'
import type { PrismaClient } from '@prisma/client'

const pkg = projectScalePackage(source)!
const definition = pkg.definition
const code = (n: number) => `IPIP50-${String(n).padStart(2, '0')}`
const uniform = (value: string) => Array.from({ length: 50 }, (_, i) => ({ itemCode: code(i + 1), responseValue: value }))
// Independent transcription of the official FIVE 10-item keys, not derived from the package.
const positive = [[1,11,21,31,41],[7,17,27,37,42,47],[3,13,23,33,43,48],[9,19],[5,15,25,35,40,45,50]]
const negative = [[6,16,26,36,46],[2,12,22,32],[8,18,28,38],[4,14,24,29,34,39,44,49],[10,20,30]]
const values = (answers: ReturnType<typeof uniform>) => scoreScale(definition, answers).scores.map(row => row.value)

describe('IPIP50 adult executable preparation 1.1.0', () => {
 it('validates and compiles through existing package protocol without claiming scientific review', () => {
  expect(parseScaleInstrumentSourceSchema(source)).toBeDefined()
  expect(validateScaleInstrumentSource(source)).toMatchObject({ valid: true })
  expect(validateScalePackage(pkg)).toMatchObject({ valid: true })
  expect(evaluateScaleProductReadiness(pkg)).toMatchObject({ ready: true })
  expect(getScalePackage(pkg.key, '1.1.0')).toBeDefined()
  expect(getScalePackage(pkg.key, '1.0.0')).toBeUndefined()
  expect(source.executable?.releaseStatus).toBe('DRAFT')
  expect(source.scientificReview).toBeUndefined()
  expect(evaluateScaleSourceScientificQualification(source).maxEligibleMaturity).toBe('PILOT')
 })
 it('binds all Chinese item texts to the reviewed source-to-translation audit',()=>{
  const audit=JSON.parse(readFileSync(resolve('../../docs/scale-instruments/ipip50-ready/1.1.0/item-source-audit.json'),'utf8'))
  expect(audit.matches).toHaveLength(50)
  expect(definition.items.map(i=>({itemCode:i.itemCode,text:i.content}))).toEqual(audit.matches.map((i:{itemCode:string;chineseWorkingTranslation:string})=>({itemCode:i.itemCode,text:i.chineseWorkingTranslation})))
 })
 it('contains only original 50 content items and five independent sums with exact key membership', () => {
  expect(definition.items.map(i => i.itemCode)).toEqual(Array.from({length:50},(_,i)=>code(i+1)))
  expect(definition.items.every(i=>!i.purpose || i.purpose==='CONTENT')).toBe(true)
  expect(definition.responseSets[0]!.options.map(o=>o.score)).toEqual([1,2,3,4,5])
  expect(definition.scoring.scores).toHaveLength(5)
  definition.scoring.scores.forEach((score,index)=>{
   expect(score.type).toBe('dimension')
   expect(score.source).toMatchObject({type:'items',aggregation:'sum'})
   if(score.source.type==='items') expect(score.source.items.map(i=>i.itemCode)).toEqual([...positive[index]!,...negative[index]!].sort((a,b)=>a-b).map(code))
  })
  expect(definition.scoring.itemRules.filter(r=>r.transform.type==='reverse').map(r=>r.itemCode)).toEqual(negative.flat().sort((a,b)=>a-b).map(code))
 })
 it.each([[1,[30,26,26,42,22]],[3,[30,30,30,30,30]],[5,[30,34,34,18,38]]] as const)('matches independent uniform %i golden', (value,expected)=>{
  expect(values(uniform(String(value)))).toEqual(expected)
 })
 it.each([10,50])('reaches all five independent endpoint sums %i',(target)=>{
  const positiveCodes=new Set(positive.flat().map(code))
  expect(values(uniform('3').map(a=>({...a,responseValue:String(positiveCodes.has(a.itemCode)===(target===50)?5:1)})))).toEqual(Array(5).fill(target))
 })
 it.each(Array.from({length:50},(_,i)=>i+1))('checks individual item %i polarity against independent key',(n)=>{
  const answers=uniform('3');answers[n-1]!.responseValue='5'
  const expected=[30,30,30,30,30];expected[(n-1)%5]! += positive.flat().includes(n)?2:-2
  expect(values(answers)).toEqual(expected)
 })
 it.each([1,2,3,4,5])('leaves only affected dimension null when item %i is absent',(n)=>{
  const answers=uniform('3').filter(a=>a.itemCode!==code(n));const expected:Array<number|null>=[30,30,30,30,30];expected[n-1]=null
  expect(values(answers)).toEqual(expected)
  expect(scoreScale(definition,answers).quality.status).toBe('invalid') // shared engine conservatively suppresses all narrative
 })
 it('keeps all-empty results unscored and rejects invalid, unknown and duplicate answers',()=>{
  expect(values([])).toEqual([null,null,null,null,null])
  for(const responseValue of ['0','6','NaN','arbitrary']) expect(()=>scoreScale(definition,[{itemCode:code(1),responseValue}])).toThrow()
  expect(()=>scoreScale(definition,[{itemCode:'UNKNOWN',responseValue:'3'}])).toThrow()
  expect(()=>scoreScale(definition,[uniform('3')[0]!,uniform('3')[0]!])).toThrow()
 })
 it('keeps runner and adult report free of item transformations and raw answers',()=>{
  const runner=JSON.stringify(runnerDefinition(definition))
  for(const field of ['itemRules','transform','baseScore','aggregation','score']) expect(runner).not.toContain(`"${field}"`)
  const result=buildScaleResult({scaleId:'synthetic-ipip',instrumentKey:pkg.key,name:'IPIP50',instrumentVersion:pkg.instrumentVersion,definition,answers:uniform('3')})
  const full=DISCLOSURE_PRESETS.FULL_REPORT()
  const report=projectScaleResult({instrument:result.instrument,result,context:{principalId:'synthetic-adult',audience:'respondent',purpose:'result',accessDecision:{source:'RESOURCE_AUTHORIZATION',allowed:true,capabilities:full},frozenPolicy:{disposition:'FROZEN_V2',disclosure:source.disclosure!},currentRestrictions:full,relationalDisposition:'NON_RELATIONAL'}})
  expect(report.kind).toBe('full')
  expect(report).toHaveProperty('interpretations')
  if(report.kind==='full') { expect(report.interpretations).toHaveLength(5); expect(report.scores).toHaveLength(5) }
  const serialized=JSON.stringify(report)
  for(const field of ['itemScores','itemRules','transform','responseValue','baseScore','rawAnswers','scorerKey']) expect(serialized).not.toContain(`"${field}"`)
  expect(definition.report.audienceContract).toMatchObject({respondent:'ADULT_SELF',audience:'student'})
  expect(definition.report.interpretations.every(i=>i.bands.length===0 && i.source.type==='score_only')).toBe(true)
  expect(definition.referencePolicy).toEqual({type:'none'})
  expect(report).not.toHaveProperty('references')
 })
 it.each([[215,'INELIGIBLE'],[216,'ELIGIBLE'],[720,'ELIGIBLE']] as const)('enforces actual adult age %i months',(ageMonths,outcome)=>{
  expect(evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',subject:{ageMonths},availableContextKeys:[]}).outcome).toBe(outcome)
 })
 it('does not assume adult eligibility when age is absent',()=>{
  expect(evaluateInstrumentEligibility(source.applicability!,{respondentType:'SELF',availableContextKeys:[]}).outcome).toBe('INDETERMINATE')
 })
 it('uses the real install planner and refuses activation without release, localization review and grants',async()=>{
  const db={scale:{findUnique:vi.fn().mockResolvedValue(null)},instrumentAuthorization:{findMany:vi.fn().mockResolvedValue([])}} as unknown as PrismaClient
  const runtime=getScaleInstrumentRuntimePolicy(pkg.key,pkg.instrumentVersion)!
  const plan=await planScaleInstrumentInstall(db,{instrumentKey:pkg.key,instrumentVersion:pkg.instrumentVersion,actorUserId:'synthetic',deploymentPolicy:{schemaVersion:1,revision:1,locale:'zh-CN',territory:'CN',deploymentModes:['STANDALONE'],commercialNature:'NON_COMMERCIAL',requiredRightsActions:['electronicAdministration','scoring','display'],authorizationRefs:['synthetic-missing'],runtimePolicyHash:runtime.runtimePolicyHash,localizationVersion:'1.1.0',inFlightCompletion:'FROZEN_DEADLINE'}})
  expect(plan.allowActivation).toBe(false)
  expect(plan.blockers).toEqual(expect.arrayContaining(['EXECUTABLE_NOT_PUBLISHED','LOCALIZATION_REVIEW_PENDING','LOCALIZATION_EXPERT_REVIEW_PENDING']))
  expect(plan.blockers.some(b=>b.includes('AUTHORIZATION'))).toBe(true)
 })
})
