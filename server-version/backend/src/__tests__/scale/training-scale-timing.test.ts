import {finalScaleSubmitSchema} from '../../services/scale-final-submit.schema'
import {describe,it,expect} from 'vitest'
import {freezeTrainingTimingPolicy,freezeTrainingTimingSnapshot,readTrainingTimingPolicy,readTrainingTimingSnapshot,normalizeTrainingScaleTiming} from '../../modules/assessment-runtime/training-scale-timing'
import {createFrozenUnitAdmission,parseFrozenUnitAdmission} from '../../modules/assessment-runtime/admission-snapshot'
const course={id:'training',courseType:'TRAINING_COURSE',isLibrary:false}
const policy=freezeTrainingTimingPolicy([course],true)
const snapshot=freezeTrainingTimingSnapshot(policy,null,1,true)!
const row={schemaVersion:1,firstResponseMs:25,activeTimeMs:50,changeCount:0,revisitCount:0,visits:1,interrupted:false,recoveredWithoutClock:false}
describe('Training optional Scale browser observations',()=>{
 it('freezes only actual Training facts and exact anonymous delivery',()=>{
  expect(snapshot.course.courseId).toBe('training')
  for(const courseType of ['LEGACY_COURSE','CAMPUS_ACTIVITY','TRAINING'])expect(()=>freezeTrainingTimingPolicy([{...course,courseType}],false)).toThrow()
  expect(()=>freezeTrainingTimingPolicy([{...course,isLibrary:true}],false)).toThrow()
  expect(()=>freezeTrainingTimingPolicy([course,{...course,id:'second'}],true)).toThrow()
  expect(()=>freezeTrainingTimingSnapshot(policy,'other',1,false)).toThrow()
 })
 it('rejects proto keys before Zod record parsing can discard them',()=>{expect(()=>finalScaleSubmitSchema.parse({submissionId:'1234567890123456',attemptEpoch:1,definitionHash:'h',answers:[],itemTimings:JSON.parse('{"__proto__":{}}')})).toThrow()})
 it('verifies both immutable hashes',()=>{
  expect(()=>readTrainingTimingPolicy({...policy,courses:[{courseId:'evil',courseType:'TRAINING_COURSE'}]})).toThrow()
  expect(()=>readTrainingTimingSnapshot({...snapshot,attemptEpoch:2})).toThrow()
 })
 it('preserves NOT_COLLECTED absence and rejects disabled injection',()=>{
  expect(normalizeTrainingScaleTiming(null,['q'],['q'],undefined)).toBeNull()
  expect(()=>normalizeTrainingScaleTiming(null,['q'],['q'],{})).toThrow()
 })
 it('allows missing optional timing without inventing zero',()=>{
  expect(normalizeTrainingScaleTiming(snapshot,['q'],['q'],undefined)).toMatchObject({status:'MISSING',items:{}})
  const result=normalizeTrainingScaleTiming(snapshot,['q'],['q'],{q:row})!
  expect(result).toMatchObject({status:'RECORDED',items:{q:row}})
  expect(result).not.toHaveProperty('answers')
 })
 it('rejects forged keys and unbounded/inconsistent telemetry',()=>{
  for(const value of [{bad:row},{q:{...row,activeTimeMs:NaN}},{q:{...row,activeTimeMs:20}},{q:{...row,visits:0}},{q:{...row,firstResponseMs:null}},{q:{...row,extra:true}}])expect(()=>normalizeTrainingScaleTiming(snapshot,['q'],['q'],value)).toThrow()
  expect(()=>normalizeTrainingScaleTiming(snapshot,['q'],[],{q:row})).toThrow()
  expect(normalizeTrainingScaleTiming(snapshot,['q'],['q'],{q:{...row,firstResponseMs:null,recoveredWithoutClock:true}})?.items.q.firstResponseMs).toBeNull()
 })
 it('binds timing into admission without changing legacy admission bytes',()=>{
  const input={attemptEpoch:1,scale:{id:'scale',code:'code',name:'scale',instrumentVersion:'1'},parent:{kind:'composite' as const,parentId:'parent',slotKey:'slot',sourceDefinitionHash:'a'.repeat(64),compiledRuntimeHash:'b'.repeat(64)},frozenAt:new Date('2026-01-01T00:00:00Z')}
  const old=createFrozenUnitAdmission(input),timed=createFrozenUnitAdmission({...input,trainingTiming:snapshot})
  expect(old).not.toHaveProperty('trainingTiming')
  expect(timed.snapshotHash).not.toBe(old.snapshotHash)
  expect(parseFrozenUnitAdmission(timed).trainingTiming).toEqual(snapshot)
  expect(()=>parseFrozenUnitAdmission({...timed,trainingTiming:{...snapshot,attemptEpoch:2}})).toThrow()
 })
})
