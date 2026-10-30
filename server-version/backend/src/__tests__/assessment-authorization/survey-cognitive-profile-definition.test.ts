import {describe,it,expect} from 'vitest'
import {getCognitiveRegistryEntry} from '../../modules/cognitive/cognitive.registry'
import {buildCognitiveProfileArtifact} from '../../modules/assessment-authorization/cognitive-profile-artifact'
import {cognitiveMeasurementRelease} from '../../modules/measurement-content/cognitive'
import {prepareRelease} from '../../modules/measurement-content/release'
import {canonicalHash} from '../../modules/assessment-runtime/canonical'
import {compileSurveyCognitiveProfile,parseFrozenSurveyCognitiveProfile,surveyCognitiveProfilePointer,surveyProfileMeasurementInput} from '../../modules/survey/cognitive-profile.definition'
import {initialCognitiveDefinition,compileResearchCognitive,parseFrozenSurveyCognitive} from '../../modules/survey/cognitive.definition'
const id='11111111-1111-4111-8111-111111111111',releaseId='22222222-2222-4222-8222-222222222222'
const config={id,testType:'reaction',configVersion:'1.1.0',engineVersion:'1.0.0',scoringVersion:'1.1.0',config:{totalTrials:20,foreperiodMinMs:700,foreperiodMaxMs:1500,timeoutMs:2000,readyDurationMs:1000,
 report:{reportVersion:'1.1.0',referenceMode:'simulated',referenceVersion:'lit-sim-k12-v0.2',referenceBand:'K7-9'}}}
const m={...prepareRelease(cognitiveMeasurementRelease({localId:'reaction',version:config.configVersion,...config,scope:{kind:'PLATFORM'}})),releaseId,status:'PUBLISHED',publishedBy:id,publishedAt:new Date()} as any
const entry=getCognitiveRegistryEntry('reaction','1.0.0','1.1.0')!
const freeze=(profile:'experience'|'research')=>compileSurveyCognitiveProfile(buildCognitiveProfileArtifact({config,entry,profile,measurement:{releaseId,contentHash:m.contentHash}}),m)
const rehash=(value:any)=>{const {measurementDigest:_,...body}=value;return {...body,measurementDigest:canonicalHash(body)}}
describe('Survey explicit native profile format beside the original controlled template',()=>{
 it('keeps one native identity, two exact profiles and a light grant pointer without an attempt seed',()=>{
  const a=freeze('experience'),b=freeze('research')
  expect(a.sessionSnapshot.config.totalTrials).toBe(8);expect(b.sessionSnapshot.config.totalTrials).toBe(60)
  expect(a.artifact.identity.configId).toBe(b.artifact.identity.configId);expect(a.measurementDigest).not.toBe(b.measurementDigest)
  expect(parseFrozenSurveyCognitive(a)).toEqual(a);expect(parseFrozenSurveyCognitive(b)).toEqual(b)
  const pointer=surveyCognitiveProfilePointer(a);expect(Object.keys(pointer).sort()).toEqual(['artifactHash','configurationHash','maxTrials','measurementDigest','schemaVersion','templateKey'].sort())
  expect(JSON.stringify(pointer)).not.toContain('resolvedConfig');expect(JSON.stringify(pointer)).not.toContain('reportDefinition');expect(a).not.toHaveProperty('randomSeed')
 })
 it('projects the existing Survey measurement from frozen scientific source and profile config',()=>{
  const a=freeze('experience'),input=surveyProfileMeasurementInput(a,{localId:id,version:'1',scope:{kind:'PRIVATE',product:'SURVEY',ownerId:id,resourceId:id}})
  expect(input.layer).toBe('MEASUREMENT');if(input.layer!=='MEASUREMENT')throw Error('Wrong layer')
  expect(input.content.executable.config).toMatchObject({totalTrials:8});expect(input.content.executable.finalMaxTrials).toBe(8)
  expect(input.sourceReleaseId).toBe(releaseId);expect(input.provenance?.profileArtifactHash).toBe(a.artifactHash)
  expect(input.content.measurementHash).toBe(canonicalHash(input.content.executable))
 })
 it('rejects changed original science or session config even if the outer digest is recomputed',()=>{
  const a=freeze('experience'),science=structuredClone(a),session=structuredClone(a)
  ;(science.sourceMeasurement.content.executable.config as any).totalTrials=999
  expect(()=>parseFrozenSurveyCognitiveProfile(rehash(science))).toThrow()
  session.sessionSnapshot.config.totalTrials=60
  expect(()=>parseFrozenSurveyCognitiveProfile(rehash(session))).toThrow()
  expect(()=>parseFrozenSurveyCognitiveProfile(rehash({...a,maxTrials:0}))).toThrow()
 })
 it('keeps the original 120-trial fixed Go/No-Go template and parser intact',()=>{
  const old=compileResearchCognitive(initialCognitiveDefinition());expect(old.schemaVersion).toBe(1)
  expect(old.sessionSnapshot.testType).toBe('gonogo');expect(old.sessionSnapshot.config.totalTrials).toBe(120)
  expect(parseFrozenSurveyCognitive(old)).toEqual(old)
 })
})
