import { describe,it,expect } from 'vitest'
import { AntCapture } from './capture'
import { antConfig,antPlan } from './generated/protocol'
import { antFixtureDisplay } from './test-fixtures'
import { antDisplayProblem,antDirectionForKey } from './display'
import { paintAnt } from './paint'
const config=antConfig('experience'),display=antFixtureDisplay(),seed='capture-test'
const create=(index=0)=>new AntCapture(config,antPlan(config,seed)[index],display,'context-A',0,1700000000000)
function target(c:AntCapture){c.tick(c.plan.plannedPreCueMs);c.tick(c.plan.plannedPreCueMs+100);c.tick(c.plan.plannedPreCueMs+500);return c.core.targetOnsetPerfMs!}
describe('ANT paint clock and fixed-display capture',()=>{
  it('uses actual paint onset/offset, one transition per frame and a 4000ms start-to-start duration',()=>{
    const c=create(),p=c.plan.plannedPreCueMs
    c.tick(p-1);expect(c.stage).toBe('fixation')
    c.tick(p+7);expect(c.core.cueOnsetPerfMs).toBe(p+7)
    c.tick(p+107);expect(c.core.cueOffsetPerfMs).toBe(p+107)
    c.tick(p+507);expect(c.core.targetOnsetPerfMs).toBe(p+507)
    c.input(c.plan.direction,'touch',p+907);expect(c.core.responseIndex).toBe(0)
    c.tick(p+915);expect(c.core.targetOffsetPerfMs).toBe(p+915)
    c.tick(4000);expect(c.stage).toBe('complete');expect(c.record().core.endedAtPerfMs).toBe(4000)
  })
  it('does not fabricate skipped phases after a long background pause',()=>{
    const c=create();c.tick(4100)
    expect(c.record().core.cueOnsetPerfMs).toBe(4100)
    expect(c.record().core.targetOnsetPerfMs).toBeNull()
  })
  it('captures early, held and repeat inputs without allowing them to become the first response',()=>{
    const c=create();c.input('left','keyboard',1,false,false)
    const at=target(c)
    c.input('left','keyboard',at+10,true,true);c.input('right','touch',at+20,false,true)
    c.input(c.plan.direction==='left'?'right':'left','pointer',at+30)
    c.input(c.plan.direction,'touch',at+40)
    expect(c.core.responseIndex).toBe(3);expect(c.core.events).toHaveLength(5)
    c.tick(at+50);c.tick(4000)
    expect(c.record().core.events[3].input).toBe('pointer')
  })
  it('keeps a response exactly at the deadline as timeout, with no fabricated RT event',()=>{
    const c=create(),at=target(c)
    c.input(c.plan.direction,'touch',at+1700);c.tick(at+1700);c.tick(4000)
    expect(c.record().core.timedOut).toBe(true);expect(c.record().core.responseIndex).toBeNull()
    expect(c.record().core.events[0].atPerfMs).toBe(at+1700)
  })
  it('interrupts with actual stage records, including before any target appeared',()=>{
    const c=create();c.tick(10);c.interrupt('visibility_lost',20)
    const r=c.record();expect(r.core.endedAtPerfMs).toBe(20);expect(r.core.targetOnsetPerfMs).toBeNull()
    expect(r.core.interruptions).toEqual([{kind:'visibility_lost',atPerfMs:20}])
    expect(()=>create().record()).toThrow(/not complete/)
  })
  it('bounds raw input/frame traces and preserves original clock discontinuity in diagnostics',()=>{
    const c=create();for(let i=0;i<40;i++)c.input('left','keyboard',i,true,true)
    expect(c.core.events).toHaveLength(32);expect(c.core.eventOverflow).toBe(true)
    c.tick(100);c.tick(90);const r=c.record()
    expect(r.raw.diagnostics[0]).toEqual({kind:'clock_discontinuity',observedAtPerfMs:90,markerAtPerfMs:100})
    expect(r.core.interruptions[0].kind).toBe('clock_discontinuity')
    const frames=create();for(let i=0;i<1100;i++)frames.tick(i)
    frames.interrupt('render_failed',1200)
    expect(frames.record().raw.frameTimesPerfMs).toHaveLength(1024)
    expect(frames.record().raw.frameOverflow).toBe(true)
    expect(frames.record().core.eventOverflow).toBe(true)
  })
  it('separates practice phase and marks synthetic fixture origin non-live',()=>{
    const c=new AntCapture(config,antPlan(config,seed,'practice')[0],display,'fixture',0,0,true)
    c.interrupt('runner_restart',1)
    expect(c.record().phase).toBe('practice');expect(c.record().core.phase).toBe('practice')
    expect(c.record().core.recordOrigin).toBe('recovered_without_timing');expect(c.record().raw.fixture).toBe(true)
  })
  it('rejects missing/mismatched/unfit geometry and synthetic calibration outside explicit review mode',()=>{
    const check=(d=display,current=display.viewport,fixture=false)=>antDisplayProblem(d,current,config,display.configHash,display.protocolSignature,fixture)
    expect(antDisplayProblem(null,display.viewport,config,display.configHash,display.protocolSignature)).toBe('missing_frozen_geometry')
    expect(check()).toBe('physical_calibration_required');expect(check(display,display.viewport,true)).toBeNull()
    expect(check({...display,origin:'host_physical_calibration'})).toBeNull()
    expect(check(display,{...display.viewport,width:800},true)).toBe('viewport_changed')
    expect(check({...display,configHash:'d'.repeat(64)},display.viewport,true)).toBe('frozen_identity_mismatch')
    expect(check({...display,geometry:{...display.geometry,fieldWidthCssPx:900}},display.viewport,true)).toBe('frozen_geometry_does_not_fit')
    expect(antDirectionForKey(display,'ArrowLeft')).toBe('left');expect(antDirectionForKey(display,'x')).toBeNull()
  })
  it('synchronously paints each cue/target and preserves absent/dash neutral identity',()=>{
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg')
    const p=antPlan(config,seed).find(p=>p.cue==='double'&&p.flanker==='neutral')!
    const c=new AntCapture(config,p,display,'paint',0,0)
    c.tick(p.plannedPreCueMs);paintAnt(svg,c,display,c.stage)
    expect(svg.querySelectorAll('line')).toHaveLength(8)
    expect(svg.querySelectorAll('path')).toHaveLength(1)
    c.tick(p.plannedPreCueMs+100);c.tick(p.plannedPreCueMs+500);paintAnt(svg,c,display,c.stage)
    expect(svg.querySelectorAll('polygon')).toHaveLength(1);expect(svg.querySelectorAll('line')).toHaveLength(1)
    const shaft=svg.querySelector('line')!
    expect(Number(shaft.getAttribute('x2'))-Number(shaft.getAttribute('x1'))).toBe(28*30/40)
    expect(svg.querySelector('polygon')!.getAttribute('points')!.split(' ')).toHaveLength(3)
    const dash=new AntCapture({...config,neutralVariant:'dashes'},{...p,neutralVariant:'dashes'},display,'paint2',0,0)
    target(dash);paintAnt(svg,dash,display,dash.stage)
    expect(svg.querySelectorAll('line')).toHaveLength(5);expect(svg.querySelectorAll('polygon')).toHaveLength(1)
    const central=new AntCapture(config,{...p,cue:'central'},display,'central',0,0)
    central.tick(p.plannedPreCueMs);paintAnt(svg,central,display,central.stage)
    expect(svg.querySelectorAll('path')).toHaveLength(0);expect(svg.querySelectorAll('line')).toHaveLength(4)
    const star=svg.querySelector('line')!
    expect(star.getAttribute('x1')).toBe('131');expect(star.getAttribute('x2')).toBe('149')
  })
})
