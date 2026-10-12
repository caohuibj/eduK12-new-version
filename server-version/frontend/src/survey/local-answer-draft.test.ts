// @vitest-environment jsdom
import {describe,it,expect,beforeEach} from 'vitest'
import {saveLocalSurveyDraft,restoreLocalSurveyDraftEnvelope,
  restoreLocalSurveyDraft,clearLocalSurveyDraft} from './local-answer-draft'
const project='33333333-3333-4333-8333-333333333333'
const attempt='44444444-4444-4444-8444-444444444444'
const digest='a'.repeat(64)
describe('Survey short-lived local-only answer recovery',()=>{
  beforeEach(()=>sessionStorage.clear())
  it('restores only the same attempt and exact frozen definition',()=>{
    const answers={form:{q1:'one',q2:{_surveyRefusal:true}}}
    expect(saveLocalSurveyDraft(project,attempt,digest,answers)).toBe(true)
    expect(restoreLocalSurveyDraft(project,attempt,digest)).toEqual(answers)
    expect(restoreLocalSurveyDraft(project,attempt,'other')).toBeNull()
    expect(restoreLocalSurveyDraft(project,attempt,digest)).toBeNull()
  })
  it('discards expired or unreasonably large answers without altering FINAL',()=>{
    expect(saveLocalSurveyDraft(project,attempt,digest,{long:'x'.repeat(257*1024)})).toBe(false)
    expect(saveLocalSurveyDraft(project,attempt,digest,{q:'draft'})).toBe(true)
    const key=sessionStorage.key(0)!
    const payload=JSON.parse(sessionStorage.getItem(key)!)
    sessionStorage.setItem(key,JSON.stringify({...payload,savedAt:Date.now()-7200001}))
    expect(restoreLocalSurveyDraft(project,attempt,digest)).toBeNull()
    clearLocalSurveyDraft(project,attempt)
    expect(sessionStorage.length).toBe(0)
  })
  it('round-trips timed Scale provenance in the same-tab draft, preserving legacy consumers',()=>{
    const answers={scale:{qone:'o4'}}
    const itemTimings={scale:{qone:{schemaVersion:1,firstResponseMs:2000,activeTimeMs:2650,
      changeCount:1,revisitCount:1,visits:2,interrupted:false,recoveredWithoutClock:false}}}
    expect(saveLocalSurveyDraft(project,attempt,digest,answers,itemTimings)).toBe(true)
    expect(restoreLocalSurveyDraft(project,attempt,digest)).toEqual(answers)
    expect(restoreLocalSurveyDraftEnvelope(project,attempt,digest))
      .toEqual({answers,itemTimings})
    expect(restoreLocalSurveyDraftEnvelope(project,attempt,'different')).toBeNull()
  })
  it('returns no invented timing when recovering an older answer-only draft',()=>{
    const answers={scale:{qone:'o3'}}
    expect(saveLocalSurveyDraft(project,attempt,digest,answers)).toBe(true)
    expect(restoreLocalSurveyDraftEnvelope(project,attempt,digest))
      .toEqual({answers})
  })

})
