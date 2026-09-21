import { describe, expect, it } from 'vitest'
import { requireCognitiveRegistryEntry } from '../../modules/cognitive/cognitive.registry'
import { buildCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { evaluateCognitiveProductReadiness } from '../../modules/cognitive/library/product-readiness'
import { mergeProfileConfig } from '../../modules/cognitive/profile-freeze'
import { validateTaskDefinition } from '../../modules/cognitive/v2/publication-gate'

describe('standard-only Pilot profiles', () => {
  const base = requireCognitiveRegistryEntry('fake','1.0.0','1.0.0')
  const standardOnly = () => ({...base, profiles:{standard:base.profiles.standard!},metricDefinitions:Object.fromEntries(Object.entries(base.metricDefinitions).map(([k,m])=>[k,{...m,availableProfiles:['standard' as const]}]))})
  it('adapts and releases a valid standard-only task without adding missing profiles',()=>{
    const entry=standardOnly(),definition=buildCognitiveV2TaskDefinition(entry)
    expect(Object.keys(definition.profiles)).toEqual(['standard'])
    expect(evaluateCognitiveProductReadiness(definition,{trialCount:3,trialDurationMs:1000,allowPractice:false,maxRtMs:60000}).ready).toBe(true)
    expect(()=>mergeProfileConfig(entry,{trialCount:3,trialDurationMs:1000,allowPractice:false,maxRtMs:60000},'research')).toThrow('未声明 Profile research')
  })
  it('rejects missing standard, broken declared research, and metrics claiming absent profiles',()=>{
    const definition=buildCognitiveV2TaskDefinition(standardOnly())
    expect(validateTaskDefinition({...definition,profiles:{}}).some(i=>i.path==='profiles')).toBe(true)
    const broken={...definition,profiles:{...definition.profiles,research:{estimatedMinutes:[1,2] as [number,number],configPatch:{trialCount:-1},reportCaveats:[]}}}
    expect(evaluateCognitiveProductReadiness(broken,{trialCount:3,trialDurationMs:1000,allowPractice:false,maxRtMs:60000}).ready).toBe(false)
    expect(validateTaskDefinition({...definition,metrics:{...definition.metrics,accuracy:{...definition.metrics.accuracy,availableProfiles:['research']}}}).some(i=>i.path==='metrics.accuracy.availableProfiles')).toBe(true)
  })
})
