import { z } from 'zod'
import type { RegistryEntry } from '../../../../../modules/cognitive/cognitive.types'
const profile = (name: 'experience' | 'standard' | 'research') => ({ profile:name,estimatedMinutes:[1,2] as [number,number],configPatch:{trialCount:2},reportCaveats:[] })
export const executionEntries: RegistryEntry<{ trialCount: number }, { correct: boolean }>[] = [{
  testType:'TEST_ONBOARDING_UNKNOWN_V1',engineVersion:'1.0.0',scoringVersion:'1.0.0',name:'Unknown structural task',category:'test',randomizationAlgorithmVersion:'none',
  configSchema:z.object({trialCount:z.number().int().min(1)}),trialSchema:z.object({correct:z.boolean()}),finalSubmission:{maxTrials:config=>config.trialCount},
  score:({trials})=>({score:trials.filter(t=>t.payload.correct).length,metrics:{correctCount:trials.filter(t=>t.payload.correct).length},qualityFlags:{empty:trials.length===0}}),
  profileDefinitionVersion:'1.0.0',profiles:{experience:profile('experience'),standard:profile('standard'),research:profile('research')},
  metricDefinitionVersion:'1.0.0',metricDefinitions:{correctCount:{key:'correctCount',label:'Unknown successes',description:'Correct responses',construct:'test',unit:'count',valueType:'integer',direction:'higher_is_better',role:'primary',availableProfiles:['experience','standard','research'],export:{summary:true,label:'Unknown successes'}}},
  referenceEligibleMetricKeys:[],qualityDefinitionVersion:'1.0.0',qualityDefinitions:{empty:{key:'empty',label:'Empty',description:'No observations'}},reportDefinitionVersion:'1.0.0',reportDefinition:{title:'Unknown report',headlineMetric:'correctCount',primaryMetrics:['correctCount'],secondaryMetrics:[],disclaimer:'Test fixture'},
  executionSemantics:{protocol:{schemaVersion:1,key:'TEST_ONBOARDING_UNKNOWN_V1/1.0.0/1.0.0',version:'1.0.0',clock:'performance',randomizationAlgorithmVersion:'none',trialEnvelopeVersion:1,phases:[{key:'learning',persists:true,required:true},{key:'delayed',persists:true,required:false}],measurementCriticalConfigPaths:['*']},qualityEffects:{empty:'invalid'},metricCategories:{correctCount:'test'},legacyStatus:'DRAFT'},
}]
