import {describe,it,expect} from 'vitest'
import archive from '../../../../../docs/cognitive-library/onboarding-content-20261028/batch-3/ant-browser/archived-fixture.json'
import {scoreAntGuided,scoreAnt} from '../../modules/cognitive/content-candidates/ant/scorer'
import {createAntGuidedSnapshot,createAntSnapshot} from '../../modules/cognitive/content-candidates/ant/package'
import type {AntConfig,AntTrial} from '../../modules/cognitive/content-candidates/ant/protocol'
import type {SessionConfigSnapshot,TrialEnvelope} from '../../modules/cognitive/v2/types'

type BoundTrial=AntTrial&{presentationBinding?:{schemaVersion:1;geometryVersion:string;geometryHash:string;displayHash:string}}
function input(){
 const a=archive[0].authority
 return {session:structuredClone(a.configSnapshot) as unknown as SessionConfigSnapshot<AntConfig>,config:structuredClone(a.configSnapshot.config) as AntConfig,
  randomSeed:a.session.randomSeed,trials:structuredClone(a.rawSubmission.payload.trials.slice(0,2)) as TrialEnvelope<BoundTrial>[]}
}
describe('ANT guided unified presentation binding',()=>{
 it('accepts two actual committed records with the original real compiled UNIFIED snapshot',()=>{
  const f=input();expect(f.session.runtimeGeneration).toBe('UNIFIED_V1');expect(f.session.compiledRuntime?.compiledRuntimeHash).toBeTruthy()
  expect(scoreAntGuided(f).metrics.validTrialCount).toBe(2)
 })
 it.each([0,1])('requires the existing presentation binding on unified record %i',index=>{
  const f=input();delete f.trials[index].payload.presentationBinding
  expect(()=>scoreAntGuided(f)).toThrow(/presentation binding/)
 })
 it.each(['geometryHash','displayHash'] as const)('rejects an attempt that changes %s between unified records',key=>{
  const f=input();f.trials[1].payload.presentationBinding![key]='a'.repeat(64)
  expect(()=>scoreAntGuided(f)).toThrow(/presentation binding/)
 })
 it('preserves bare guided and historical 1.0.0 candidate contracts',()=>{
  const f=input();for(const t of f.trials)delete t.payload.presentationBinding
  const guided=createAntGuidedSnapshot('experience'),old=createAntSnapshot('experience')
  expect(scoreAntGuided({...f,session:guided,config:guided.config}).metrics.validTrialCount).toBe(2)
  expect(scoreAnt({...f,session:old,config:old.config}).metrics.validTrialCount).toBe(2)
 })
})
