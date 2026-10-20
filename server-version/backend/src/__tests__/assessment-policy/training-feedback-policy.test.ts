import { describe, expect, it } from 'vitest'
import { parseTrainingFeedbackPolicy, trainingFeedbackAvailability } from '../../modules/assessment-policy/training-feedback-policy'
const now=new Date('2026-10-19T05:00:00.000Z')
const scheduled={schemaVersion:1,mode:'SCHEDULED',releaseAt:'2026-10-19T14:00:00+09:00'}
const evaluate=(changes:Partial<Parameters<typeof trainingFeedbackAvailability>[0]>={})=>trainingFeedbackAvailability({policy:undefined,completed:true,reportReady:true,now,...changes})
describe('Training feedback timing policy (pure; runtime integration pending)',()=>{
 it('defaults legacy absence to immediate completion feedback',()=>{
  expect(evaluate().state).toBe('AVAILABLE')
  expect(parseTrainingFeedbackPolicy(null)).toEqual({schemaVersion:1,mode:'IMMEDIATE'})
 })
 it('never exposes a child result before whole-attempt completion',()=>{
  expect(evaluate({completed:false}).state).toBe('WAITING_SUBMISSION')
  expect(evaluate({policy:scheduled,completed:false}).state).toBe('WAITING_SUBMISSION')
 })
 it('does not equate release time with generation success',()=>{
  expect(evaluate({reportReady:false}).state).toBe('REPORT_PROCESSING')
  expect(evaluate({policy:scheduled,reportReady:false}).state).toBe('REPORT_PROCESSING')
 })
 it('withholds already generated reports strictly before release',()=>{
  expect(evaluate({policy:scheduled,now:new Date(now.getTime()-1)})).toEqual({state:'GENERATED_NOT_RELEASED',releaseAt:now.toISOString()})
 })
 it('opens on the exact release boundary and afterward',()=>{
  expect(evaluate({policy:scheduled}).state).toBe('AVAILABLE')
  expect(evaluate({policy:scheduled,now:new Date(now.getTime()+1)}).state).toBe('AVAILABLE')
 })
 it('normalizes explicit time zones without depending on the browser zone',()=>{
  expect(parseTrainingFeedbackPolicy(scheduled)).toEqual({...scheduled,releaseAt:now.toISOString()})
 })
 it('rejects malformed configured policies rather than treating them as immediate',()=>{
  for(const policy of [{}, {schemaVersion:2,mode:'IMMEDIATE'}, {...scheduled,releaseAt:'2026-10-19T14:00:00'}, {...scheduled,releaseAt:'invalid'}, {schemaVersion:1,mode:'IMMEDIATE',releaseAt:now.toISOString()}])expect(()=>evaluate({policy})).toThrow()
 })
 it('rejects an invalid authoritative clock',()=>{
  expect(()=>evaluate({now:new Date(NaN)})).toThrow('Invalid server time')
 })
})
