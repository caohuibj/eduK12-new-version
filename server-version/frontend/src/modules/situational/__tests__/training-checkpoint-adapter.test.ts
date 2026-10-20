import { describe, expect, it } from 'vitest'
import { situationalCheckpointAnswers, situationalCheckpointUnsupported } from '../training-checkpoint-adapter'
import type { SituationalAttemptResponse } from '../types'
const data = () => ({instrument:{definition:{schemaVersion:1,respondentType:'participant_self_report',sampling:{strategy:'ALL'},scenes:[{sceneKey:'s1',sortOrder:0,title:'one',stimulus:{type:'TEXT_V1',text:'text'},channels:[{channelKey:'c1',responseType:'SINGLE_CHOICE',prompt:'choose',options:[{optionKey:'a',label:'A'}]}]}]}}} as unknown as SituationalAttemptResponse)
describe('Training SJT checkpoint answer adapter',()=>{
 it('keeps answer fields while excluding score and media fields',()=>{
  expect(situationalCheckpointAnswers(data(),{'s1:c1':{responseValue:'a',score:99,mediaUrl:'secret'}})).toEqual({'s1:c1':{responseValue:'a'}})
 })
 it('rejects unknown keys and non-finite or invalid answer values',()=>{
  expect(()=>situationalCheckpointAnswers(data(),{unknown:{responseValue:'a'}})).toThrow()
  for(const responseValue of [NaN,Infinity,{},[1]])expect(()=>situationalCheckpointAnswers(data(),{'s1:c1':{responseValue}})).toThrow()
 })
 it('does not reconstruct research journals or video evidence',()=>{
  const research=data();research.instrument.assignment={} as never
  expect(situationalCheckpointUnsupported(research)).toBe(true)
  expect(()=>situationalCheckpointAnswers(research,{})).toThrow()
  const video=data();video.instrument.definition.scenes[0].stimulus={type:'VIDEO'} as never
  expect(situationalCheckpointUnsupported(video)).toBe(true)
 })
 it('rejects staged flow restoration and allows ordinary empty drafts',()=>{
  const staged=data();staged.instrument.definition={...staged.instrument.definition,schemaVersion:2,flow:{nodes:[{nodeType:'SCENE',responseStages:[{}]}]}} as never
  expect(situationalCheckpointUnsupported(staged)).toBe(true)
  expect(situationalCheckpointAnswers(data(),{})).toEqual({})
 })
})
