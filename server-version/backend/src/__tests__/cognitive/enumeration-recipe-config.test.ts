import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
vi.mock('dotenv', () => ({ default: { config: () => ({ parsed: {} }) } }))
import { enumerationDefinition, enumerationRecipeDefinition, createEnumerationSnapshot,
  createEnumerationRecipeSnapshot, enumerationTrialEnvelope } from '../../modules/cognitive/content-candidates/enumeration/package'
import { ENUMERATION_IDENTITY, ENUMERATION_RECIPE_IDENTITY, enumerationConfig, enumerationRecipeConfig,
  enumerationPlan, enumerationRecipePlan, enumerationSequence, enumerationRecipeSequence, enumerationConfigEqual,
  type EnumerationProfile, type EnumerationTrial } from '../../modules/cognitive/content-candidates/enumeration/protocol'
import { enumerationConfigSchema, enumerationRecipeConfigSchema } from '../../modules/cognitive/content-candidates/enumeration/schema'
import { scoreEnumeration, scoreEnumerationRecipe } from '../../modules/cognitive/content-candidates/enumeration/scorer'
import { projectEnumerationReport, projectStoredEnumerationReport, type EnumerationStoredSnapshot } from '../../modules/cognitive/content-candidates/enumeration/report'
import { runAuthoritativeScorer } from '../../modules/cognitive/v2/authoritative-scorer'
import { getNativeCognitiveTaskDefinition } from '../../modules/cognitive/content-candidates/native-registry/definitions'
import { getCognitiveTaskResource } from '../../modules/cognitive/task-resource'
import { freezeNativeAssignmentProfile, readFrozenReport } from '../../modules/cognitive/profile-freeze'
import { validateTaskDefinition } from '../../modules/cognitive/v2/publication-gate'

const repo=resolve(process.cwd(),'../..')
const evidence=resolve(repo,'docs/cognitive-library/next-candidates-20261026/enumeration/implementation/recipe-config-20261026')
const baseline=JSON.parse(readFileSync(resolve(evidence,'legacy-descriptors-and-snapshots.json'),'utf8'))
const approved=JSON.parse(readFileSync(resolve(repo,'docs/cognitive-library/next-candidates-20261026/enumeration/input-contract-20261026/recipe-definition.proposed.json'),'utf8'))
const seed='thin-recipe-contract-only-中文-20261026'
function fixture() {
  return [0,1,2].map(index=>{
    const plan=enumerationRecipePlan(enumerationRecipeConfig('experience'),seed,index), start=index*10000
    const answer=plan.targetValue+index-1
    return enumerationTrialEnvelope({phase:'test',plan,recordOrigin:'live',startedAtPerfMs:start,
      stimulusOnsetPerfMs:start+1000,maskOnsetPerfMs:start+1050,responseStartedAtPerfMs:start+2050,
      confirmedAtPerfMs:start+2250,endedAtPerfMs:start+2300,responseValue:answer,responseInput:'touch',
      sliderChanges:[{value:answer,atPerfMs:start+2150,input:'touch'}],prematureInputs:0,timedOut:false,interruptions:[],
      timingFacts:{source:'client_reported',stimulusFrameCount:3,maskFrameCount:60,stimulusMaxFrameGapMs:16.7,
        maskMaxFrameGapMs:16.7,incomplete:false,overflow:false},calibrationReference:'synthetic:calibration',
      renderedStimulusReference:'synthetic:artifact'} satisfies EnumerationTrial)
  })
}
const scoreNew=(trials: unknown[]=fixture())=>runAuthoritativeScorer({definition:enumerationRecipeDefinition,
  session:createEnumerationRecipeSnapshot('experience'),trials,randomSeed:seed})
function descriptor(d:typeof enumerationDefinition) {
  return {schemaVersion:d.schemaVersion,testType:d.testType,name:d.name,category:d.category,engineVersion:d.engineVersion,
    scoringVersion:d.scoringVersion,protocol:d.protocol,metrics:d.metrics,quality:d.quality,report:d.report,
    profiles:d.profiles,references:d.references,publication:d.publication}
}
const reverseObject=(value:unknown):unknown=>Array.isArray(value)?value.map(reverseObject):value&&typeof value==='object'
  ?Object.fromEntries(Object.entries(value).reverse().map(([k,v])=>[k,reverseObject(v)])):value

describe('complete enumeration recipe configuration; exact old/new native identities',()=>{
  it('preserves actual prechange historical descriptors and both snapshot bytes',()=>{
    expect(JSON.stringify(descriptor(enumerationDefinition))).toBe(JSON.stringify(baseline.descriptor))
    for(const profile of ['research','experience'] as const)
      expect(JSON.stringify(createEnumerationSnapshot(profile))).toBe(JSON.stringify(baseline.snapshots[profile]))
    expect(ENUMERATION_IDENTITY).toMatchObject({engineVersion:'0.1.0',configVersion:'0.2.0',scoringVersion:'0.2.0'})
    expect(ENUMERATION_RECIPE_IDENTITY).toMatchObject({engineVersion:'0.2.0',configVersion:'0.3.0',scoringVersion:'0.2.0'})
  })
  it.each(['research','experience'] as const)('freezes the direct approved Recipe and preserves %s sequence/practice/slider stream',profile=>{
    const config=enumerationRecipeConfig(profile), snapshot=createEnumerationRecipeSnapshot(profile)
    expect(config.stimulusRecipe).toEqual(approved)
    expect(config.stimulusRecipe).not.toHaveProperty('definition');expect(config.stimulusRecipe).not.toHaveProperty('hash')
    expect(snapshot.configVersion).toBe('0.3.0');expect(snapshot.engineVersion).toBe('0.2.0')
    expect(snapshot.configHash).not.toBe(createEnumerationSnapshot(profile).configHash)
    expect(snapshot.protocolSignature).toBe(createEnumerationSnapshot(profile).protocolSignature)
    const reordered=reverseObject(config) as typeof config
    expect(enumerationConfigEqual(reordered,config)).toBe(true)
    expect(enumerationRecipeSequence(reordered,seed)).toEqual(enumerationSequence(enumerationConfig(profile),seed))
    expect(enumerationRecipeSequence(reordered,seed,'practice')).toEqual(enumerationSequence(enumerationConfig(profile),seed,'practice'))
    expect(()=>enumerationPlan(config,seed,0)).toThrow('configuration')
    expect(()=>enumerationRecipePlan({...config,stimulusRecipe:null} as unknown as typeof config,seed,0)).toThrow('configuration')
    expect(enumerationRecipeConfigSchema.parse(reordered)).toEqual(config)
    expect(enumerationConfigSchema.safeParse(config).success).toBe(false)
  })
  it('strictly rejects recipe substitutions/wrappers/extra keys and preserves independent configuration objects',()=>{
    const config=enumerationRecipeConfig('experience')
    const candidates=[null,{definition:approved}, {...approved,hash:'not-an-existing-field'},
      {...approved,formalExposureMs:51},{...approved,source:'synthetic_fixture'},
      {...approved,mask:{...approved.mask,seed:1}}, {...approved,mask:{...approved.mask,values:['#EBEBEB','#141414']}}]
    for(const stimulusRecipe of candidates) {
      const changed={...config,stimulusRecipe}
      expect(enumerationRecipeConfigSchema.safeParse(changed).success).toBe(false)
      expect(enumerationConfigEqual(changed,config)).toBe(false)
    }
    const next=enumerationRecipeConfig('experience');next.stimulusRecipe.mask.values[0]='#EBEBEB' as '#141414'
    expect(enumerationRecipeConfig('experience').stimulusRecipe).toEqual(approved)
    expect(enumerationConfigEqual({...config,extra:undefined},config)).toBe(false)
  })
  it('resolves exact old/new metadata and profile freeze without enabling delivery or inventing a standard profile',()=>{
    for(const [engine,version] of [['0.1.0','0.2.0'],['0.2.0','0.3.0']] as const) {
      const d=getNativeCognitiveTaskDefinition('enumeration',engine,'0.2.0')!,r=getCognitiveTaskResource('enumeration',engine,'0.2.0')!
      expect(r.kind).toBe('native');if(r.kind!=='native')throw Error('native required')
      expect(r.configVersion).toBe(version);expect(r.profileDefinitionVersion).toBe(version)
      expect(r.metricDefinitionVersion).toBe('0.2.0');expect(r.qualityDefinitionVersion).toBe('0.2.0')
      expect(r.reportDefinitionVersion).toBe('0.2.0');expect(r.recommendedForCreate).toBe(false)
      expect(Object.keys(d.profiles)).toEqual(['research','experience'])
      expect(validateTaskDefinition(d).filter(x=>x.severity==='error')).toEqual([])
      for(const profile of ['research','experience'] as const) {
        const config=version==='0.3.0'?enumerationRecipeConfig(profile):enumerationConfig(profile)
        const frozen=freezeNativeAssignmentProfile({resource:r,baseConfig:config,profile})
        const report=readFrozenReport(frozen.resolvedReportSnapshotEncrypted)!
        expect(report.nativeIdentity).toMatchObject({engineVersion:engine,configVersion:version,scoringVersion:'0.2.0'})
        expect(report.profileDefinitionVersion).toBe(version)
      }
    }
    expect(getNativeCognitiveTaskDefinition('enumeration','0.2.0','0.1.0')).toBeUndefined()
    expect(getNativeCognitiveTaskDefinition('enumeration','0.3.0','0.2.0')).toBeUndefined()
  })
  it('uses actual new scorer identity with unchanged math and keeps legacy result/report compatibility',()=>{
    const trials=fixture(), raw=JSON.stringify(trials), next=scoreNew(trials)
    const old=runAuthoritativeScorer({definition:enumerationDefinition,session:createEnumerationSnapshot('experience'),trials,randomSeed:seed})
    const {reportBinding:oldBinding,...oldMath}=old.metrics,{reportBinding:nextBinding,...nextMath}=next.metrics
    expect(nextMath).toEqual(oldMath);expect(next.quality).toEqual(old.quality);expect(next.audit).toEqual(old.audit)
    expect(next.metrics).toMatchObject({correctTrialCount:1,includedTrialCount:3,overReportedTrialCount:1,
      underReportedTrialCount:1,signedMeanError:0,meanAbsoluteError:2/3})
    expect(nextBinding).toMatchObject({engineVersion:'0.2.0',configVersion:'0.3.0'})
    expect(oldBinding).toMatchObject({engineVersion:'0.1.0',configVersion:'0.2.0'})
    expect(JSON.stringify(trials)).toBe(raw)
    expect(projectEnumerationReport(next,{config:reverseObject(enumerationRecipeConfig('experience')) as ReturnType<typeof enumerationRecipeConfig>,randomSeed:seed})).toMatchObject({state:'limited',headline:{correct:1,denominator:3}})
    expect(projectEnumerationReport(old,{config:enumerationConfig('experience'),randomSeed:seed})).toMatchObject({state:'limited',headline:{correct:1,denominator:3}})
    expect(projectEnumerationReport(next,{config:enumerationConfig('experience'),randomSeed:seed}).state).toBe('invalid')
    for(const [result,snapshot] of [[old,createEnumerationSnapshot('experience')],[next,createEnumerationRecipeSnapshot('experience')]] as const) {
      const stored:EnumerationStoredSnapshot={schemaVersion:1,completedAt:'2026-10-26T00:00:00.000Z',testType:'enumeration',
        configVersion:snapshot.configVersion,engineVersion:snapshot.engineVersion,scoringVersion:snapshot.scoringVersion,
        protocolSignature:snapshot.protocolSignature,profile:'experience',metrics:result.metrics,quality:result.quality,
        references:[],report:{frozenText:'unchanged'},assessmentContext:null}
      const bytes=JSON.stringify(stored)
      expect(projectStoredEnumerationReport(stored).state).toBe('limited');expect(JSON.stringify(stored)).toBe(bytes)
      expect(projectStoredEnumerationReport({...stored,engineVersion:'unknown'}).state).toBe('invalid')
    }
  })
  it('rejects old/new tuple/config mixing and retains empty/exclusion/null consequences without timing cutoffs',()=>{
    const trials=fixture(),current=createEnumerationRecipeSnapshot('experience'),legacy=createEnumerationSnapshot('experience')
    expect(()=>scoreEnumerationRecipe({config:enumerationRecipeConfig('experience'),session:legacy as unknown as ReturnType<typeof createEnumerationRecipeSnapshot>,trials,randomSeed:seed})).toThrow('identity')
    expect(()=>scoreEnumeration({config:enumerationConfig('experience'),session:current,trials,randomSeed:seed})).toThrow('identity')
    expect(()=>scoreEnumerationRecipe({config:{...enumerationRecipeConfig('experience'),stimulusRecipe:null} as unknown as ReturnType<typeof enumerationRecipeConfig>,session:current,trials,randomSeed:seed})).toThrow()
    const empty=scoreNew([]);expect(empty.quality.state).toBe('invalid');expect(empty.metrics.overallAccuracy).toBeNull()
    trials[0].payload.prematureInputs=1
    trials[1].payload.timingFacts.stimulusMaxFrameGapMs=66.7
    const partial=scoreNew(trials);expect(partial.metrics.includedTrialCount).toBe(2)
    expect(partial.metrics.excludedTrialReasons).toEqual({'0':['premature_input']})
    expect(partial.quality.state).toBe('limited');expect(partial.metrics.signedMeanError).toBe(0.5)
  })
})
