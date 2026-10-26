import {describe,it,expect} from 'vitest'
import {MotCapture} from './capture'
import {motConfig,motTrialPlan,motPosition,motGeometry,summarizeMotFrames,type MotCalibration} from './generated/protocol'
const config=motConfig('experience'),seed='mot-runtime-contract'
const calibration:MotCalibration={version:1,method:'ruler_and_distance_self_reported',referenceMm:50,
 referenceCssPx:190,viewingDistanceMm:350,viewportWidthCssPx:820,viewportHeightCssPx:1180,
 devicePixelRatio:2,visualViewportScale:1,language:'zh'}
const start=100
function moving(){const c=new MotCapture(config,motTrialPlan(config,seed,0),calibration,start)
 c.tick(600);c.tick(1600);return c}
function responding(){const c=moving()
 for(let t=1616;t<9600;t+=16)c.tick(t)
 c.tick(9600);c.tick(10100);return c}
describe('MOT actual capture state machine',()=>{
 it('uses actual paint transitions and separates core summaries from complete raw frames',()=>{
  const c=responding()
  for(const id of c.plan.targetIds){const p=motPosition(c.plan.objects[id],8000,config);expect(c.select(p,'keyboard',10200+id,id)).toBe(true)}
  const {core,raw}=c.record()
  expect(c.stage).toBe('complete');expect(core.responses).toHaveLength(5)
  expect(core.frameTiming.frameCount).toBe(raw.motionFrameTimesMs.length)
  expect(core).not.toHaveProperty('motionFrameTimesMs')
  expect(core.calibration).toEqual(calibration)
  expect(core.frameTiming.source).toBe('client_reported')
 })
 it('does not fabricate intermediate phase timestamps after a long pause',()=>{
  const c=new MotCapture(config,motTrialPlan(config,seed,0),calibration,100)
  expect(c.tick(90000)).toBe('cue')
  expect(c.trial.cueStartedAtPerfMs).toBe(90000)
  expect(c.trial.motionStartedAtPerfMs).toBeNull()
 })
 it('records early inputs and never changes a prior selection',()=>{
  const c=moving();expect(c.select({x:1,y:1},'touch',1700)).toBe(false)
  expect(c.trial.prematureInputs).toBe(1)
  const d=responding(),id=d.plan.targetIds[0],p=motPosition(d.plan.objects[id],8000,config)
  expect(d.select(p,'keyboard',10200,id)).toBe(true)
  expect(d.select(p,'keyboard',10201,id)).toBe(false)
  expect(d.trial.responses).toHaveLength(1)
 })
 it('ignores ambiguous touch overlap but permits an explicitly focused keyboard circle',()=>{
  const c=responding()
  // Runtime test creates a deliberate overlap; authoritative seed validation is separate.
  const p={...c.plan.objects[0],id:1};c.plan.objects[1]=p
  const point=motPosition(c.plan.objects[0],8000,config)
  expect(c.select(point,'touch',10200)).toBe(false)
  expect(c.trial.ambiguousInputs).toBe(1)
  expect(c.select(point,'keyboard',10201,1)).toBe(true)
 })
 it.each(['visibility_lost','window_blur','viewport_changed','runner_restart'] as const)('retains incomplete %s evidence',reason=>{
  const c=moving();c.interrupt(reason,2000)
  const record=c.record();expect(record.core.interruptions).toEqual([reason])
  expect(record.core.responseStartedAtPerfMs).toBeNull()
  expect(record.core.responses).toEqual([])
 })
 it('bounds frame collection and records overflow instead of claiming complete telemetry',()=>{
  const c=moving()
  for(let i=1;i<4000;i++)c.tick(1600+i)
  c.interrupt('window_blur',6000)
  expect(c.record().raw.motionFrameTimesMs).toHaveLength(3000)
  expect(c.record().core.frameTiming.overflow).toBe(true)
 })
 it('preserves visual-angle geometry and refuses a too-small display without shrinking',()=>{
  const large=motGeometry(calibration,800,900),small=motGeometry(calibration,200,200)
  expect(large.fits).toBe(true);expect(small.fits).toBe(false)
  expect(large.fieldCssPx).toBe(small.fieldCssPx)
  expect(large.fieldCssPx/large.objectCssPx).toBe(10)
  expect(summarizeMotFrames([0,1,1]).strictlyIncreasing).toBe(false)
 })
})
