import {describe,expect,it} from 'vitest'
import {SurveyScaleTimingTracker,emptyRecoveredTiming,sealSurveyScaleTimings} from './survey-scale-timing'

describe('Survey frozen one-by-one response timing',()=>{
  it('records first choice, multi-visit foreground time, revisions and re-entry',()=>{
    const tracker=new SurveyScaleTimingTracker()
    tracker.enter('qone',true,100)
    tracker.answer('qone',undefined,'o2',2450)
    tracker.leave(3000)
    tracker.enter('qone',true,4000)
    tracker.answer('qone','o2','o4',4450)
    tracker.leave(5500)
    const row=tracker.snapshot(5500).qone
    expect(row).toMatchObject({schemaVersion:1,firstResponseMs:2350,
      activeTimeMs:4400,changeCount:1,revisitCount:1,visits:2,
      recoveredWithoutClock:false,interrupted:false})
  })
  it('pauses visibility clock and never inflates time while the tab is hidden',()=>{
    const tracker=new SurveyScaleTimingTracker()
    tracker.enter('qone',true,100)
    tracker.suspend(1100)
    tracker.resume(101100)
    tracker.answer('qone',undefined,'o1',102100)
    const item=tracker.snapshot(102100).qone
    expect(item.firstResponseMs).toBe(2000)
    expect(item.activeTimeMs).toBe(2000)
    expect(item.interrupted).toBe(true)
  })
  it('does not flag every completed item interrupted after a draft reload',()=>{
    const previous={qone:{schemaVersion:1 as const,firstResponseMs:850,
      activeTimeMs:1200,changeCount:0,revisitCount:0,visits:1,
      interrupted:false,recoveredWithoutClock:false},
      qtwo:{schemaVersion:1 as const,firstResponseMs:null,
      activeTimeMs:300,changeCount:0,revisitCount:0,visits:1,
      interrupted:false,recoveredWithoutClock:true}}
    const tracker=new SurveyScaleTimingTracker(previous,{qone:'o2',qtwo:'o4'})
    expect(tracker.snapshot().qone.interrupted).toBe(false)
    expect(tracker.snapshot().qtwo.interrupted).toBe(true)
  })
  it('does not fabricate 0 ms when the first selection occurred while hidden',()=>{
    const tracker=new SurveyScaleTimingTracker()
    tracker.enter('qone',false,200)
    tracker.answer('qone',undefined,'o4',900)
    expect(tracker.snapshot(900).qone).toMatchObject({
      firstResponseMs:null,activeTimeMs:0,
      recoveredWithoutClock:true,interrupted:true,
    })
  })
  it('never invents an old first reaction time after cross-device recovery',()=>{
    const tracker=new SurveyScaleTimingTracker({}, {qone:'o4'})
    tracker.enter('qone',true,0)
    tracker.answer('qone','o4','o5',1000)
    const entry=tracker.snapshot(1000).qone
    expect(entry.firstResponseMs).toBeNull()
    expect(entry.recoveredWithoutClock).toBe(true)
    expect(entry.changeCount).toBe(1)
    expect(sealSurveyScaleTimings(['qone','qtwo'],{qone:'o5',qtwo:'o1'},
      {qone:entry}).qtwo).toEqual(emptyRecoveredTiming())
  })
  it('supports valid item keys matching Object.prototype properties',()=>{
    const tracker=new SurveyScaleTimingTracker()
    tracker.enter('constructor',true,100)
    tracker.answer('constructor',undefined,'o2',350)
    const observed=tracker.snapshot()
    expect(Object.values(observed)[0]?.firstResponseMs).toBe(250)
    const sealed=sealSurveyScaleTimings(['constructor'],{constructor:'o2'},observed)
    expect(Object.values(sealed)[0]?.firstResponseMs).toBe(250)
    expect(Object.keys(sealSurveyScaleTimings(['constructor'],{},{}))).toHaveLength(0)
    const recovered=new SurveyScaleTimingTracker({}, {constructor:'o3'})
    recovered.enter('constructor',true,100)
    recovered.answer('constructor','o3','o4',350)
    expect(Object.values(recovered.snapshot())[0]).toMatchObject({
      firstResponseMs:null,recoveredWithoutClock:true,changeCount:1,
    })
  })
  it('keeps same final snapshot as a stable rounded, nonnegative integer payload',()=>{
    const t=new SurveyScaleTimingTracker()
    t.enter('q',true,10.2)
    t.answer('q',undefined,'yes',123.8)
    const a=t.snapshot(123.8)
    const b=t.snapshot(123.8)
    expect(a).toEqual(b)
    expect(a.q.firstResponseMs).toBe(114)
    expect(a.q.activeTimeMs).toBe(114)
  })
})
