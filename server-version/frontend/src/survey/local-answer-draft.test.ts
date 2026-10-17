// @vitest-environment jsdom
import {describe,it,expect,beforeEach,vi} from 'vitest'
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
  it('keeps a realistic large timed Wave recoverable beyond legacy draft limit',()=>{
    const answers=Object.fromEntries(Array.from({length:10},(_,i)=>[
      'scale'+i,Object.fromEntries(Array.from({length:200},(_,j)=>['q'+j,'o4'])),
    ]))
    const itemTimings=Object.fromEntries(Array.from({length:10},(_,i)=>[
      'scale'+i,Object.fromEntries(Array.from({length:200},(_,j)=>['q'+j,{
        schemaVersion:1,firstResponseMs:1500,activeTimeMs:2500,
        changeCount:1,revisitCount:0,visits:1,interrupted:false,
        recoveredWithoutClock:false,
      }])),
    ]))
    expect(JSON.stringify({answers,itemTimings}).length).toBeGreaterThan(256*1024)
    expect(saveLocalSurveyDraft(project,attempt,digest,answers,itemTimings)).toBe(true)
    const saved=restoreLocalSurveyDraftEnvelope<typeof answers>(project,attempt,digest)
    expect(saved?.answers.scale0.q0).toBe('o4')
    expect((saved?.itemTimings?.scale9 as Record<string,unknown>)?.q199).toBeTruthy()
  })
  it('returns no invented timing when recovering an older answer-only draft',()=>{
    const answers={scale:{qone:'o3'}}
    expect(saveLocalSurveyDraft(project,attempt,digest,answers)).toBe(true)
    expect(restoreLocalSurveyDraftEnvelope(project,attempt,digest))
      .toEqual({answers})
  })

  it('preserves only the bounded submission descriptor with the existing exact answer envelope',()=>{
    const answers={scale:{qone:'o3'}}
    const finalSubmission={submissionId:'f'.repeat(36),screenOut:false,presentation:{shownBlocks:['scale']}}
    expect(saveLocalSurveyDraft(project,attempt,digest,answers,undefined,finalSubmission)).toBe(true)
    expect(restoreLocalSurveyDraftEnvelope(project,attempt,digest)).toEqual({answers,finalSubmission})
    const key=sessionStorage.key(0)!
    const saved=JSON.parse(sessionStorage.getItem(key)!)
    sessionStorage.setItem(key,JSON.stringify({...saved,finalSubmission:{...finalSubmission,accessCredential:'must-not-restore'}}))
    expect(restoreLocalSurveyDraftEnvelope(project,attempt,digest)).toEqual({answers,finalSubmission})
    sessionStorage.setItem(key,JSON.stringify({...saved,finalSubmission:{...finalSubmission,submissionId:42}}))
    expect(restoreLocalSurveyDraftEnvelope(project,attempt,digest)).toBeNull()
  })

  it('does not extend a sealed request lifetime when saving its exact retry again',()=>{
    const clock=vi.spyOn(Date,'now').mockReturnValue(10000000)
    try{
      const finalSubmission={submissionId:'f'.repeat(36),screenOut:false}
      expect(saveLocalSurveyDraft(project,attempt,digest,{form:{q:'yes'}},undefined,finalSubmission)).toBe(true)
      clock.mockReturnValue(10000000+7200001)
      expect(saveLocalSurveyDraft(project,attempt,digest,{form:{q:'yes'}},undefined,finalSubmission)).toBe(true)
      expect(restoreLocalSurveyDraftEnvelope(project,attempt,digest)).toBeNull()
    }finally{clock.mockRestore()}
  })

})
