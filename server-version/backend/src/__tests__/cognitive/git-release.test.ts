import { resolve } from 'node:path'
import { compileEffectiveDisclosure } from '../../modules/scale/policy/disclosure'
import { cognitiveParticipantResult,parseCognitiveResultSnapshot } from '../../modules/cognitive/v2/result-snapshot'
import { rmSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { checkCognitiveGitRelease } from '../../modules/cognitive/git-release'
import { cognitiveDeclarationFixture } from './git-release.fixture'

describe('declarative Cognitive publication', () => {
  it('validates installed golden fixtures and keeps the measurement hash across report revisions', () => {
    const fixture=cognitiveDeclarationFixture()
    try {
      const [oldReport,newReport]=checkCognitiveGitRelease(fixture.root,fixture.key)
      expect(oldReport.measurementHash).toBe(newReport.measurementHash)
      expect(oldReport.reportVersion).not.toBe(newReport.reportVersion)
    } finally {rmSync(fixture.root,{recursive:true,force:true})}
  })

  it('keeps the execution fingerprint when a new P version retains identical execution inputs',()=>{
    const fixture=cognitiveDeclarationFixture()
    try {
      const nextP=fixture.version('p2')
      fixture.set('parameters/'+nextP+'.json',{...fixture.parameter,version:nextP})
      fixture.set('reports/'+fixture.version('r2')+'.json',{...fixture.report,version:fixture.version('r2'),parameterVersion:nextP})
      fixture.releases[1].parameterVersion=nextP
      fixture.write()
      const [current,next]=checkCognitiveGitRelease(fixture.root,fixture.key)
      expect(current).toHaveProperty('measurementHash')
      expect(next).toMatchObject({measurementHash:'measurementHash'in current?current.measurementHash:null,parameterVersion:nextP})
    } finally {rmSync(fixture.root,{recursive:true,force:true})}
  })

  it('reports a registered Gonogo implementation when no Git release has been selected', () => {
    const actual=resolve(__dirname,'../../modules/cognitive/tasks')
    expect(checkCognitiveGitRelease(actual,'gonogo')).toEqual([
      {engineVersion:'1.0.0',scoringVersion:'1.0.0',state:'REGISTERED_UNSELECTED'},
    ])
  })

  it('returns the masked response while preserving server-only numeric and quality facts',()=>{
    const disclosure=compileEffectiveDisclosure(undefined,{schemaVersion:1,policyVersion:'fixture',unknownAudience:'DENY',
      audiences:{respondent:{numericScores:false,references:true,scoreDerivedLabels:true,
        individualInterpretations:false,educationalContent:true,artwork:false}}},undefined)
    const snapshot=parseCognitiveResultSnapshot({schemaVersion:1,completedAt:'2026-11-28T00:00:00Z',testType:'gonogo',
      configVersion:'synthetic',engineVersion:'1.0.0',scoringVersion:'1.0.0',protocolSignature:'a'.repeat(64),profile:'standard',
      metrics:{hitRate:.8},quality:{state:'interpretable',flags:{privateFlag:true},reasons:['private']},
      references:[{metricKey:'hitRate',observed:.8}],report:{headline:[],user:[],detail:[]},assessmentContext:null,effectiveDisclosure:disclosure})
    expect(cognitiveParticipantResult(snapshot)).toMatchObject({metrics:{},qualityFlags:{},references:[],quality:{reasons:[]}})
    expect(snapshot.metrics).toEqual({hitRate:.8})
  })

  it('rejects inline executable runner settings and unknown engine versions', () => {
    const fixture=cognitiveDeclarationFixture()
    try {
      fixture.set('parameters/'+fixture.parameter.version+'.json',{
        ...fixture.parameter,config:{...fixture.parameter.config,runnerScript:'not a supported field'},
      })
      expect(()=>checkCognitiveGitRelease(fixture.root,fixture.key)).toThrow()
      fixture.set('parameters/'+fixture.parameter.version+'.json',{...fixture.parameter,engineVersion:'9.9.9'})
      expect(()=>checkCognitiveGitRelease(fixture.root,fixture.key)).toThrow(/not installed/)
    } finally {rmSync(fixture.root,{recursive:true,force:true})}
  })
})
