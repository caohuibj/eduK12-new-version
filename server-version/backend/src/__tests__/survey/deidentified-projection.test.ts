import {afterAll,describe,expect,it,vi} from 'vitest'
import {projectRawItems} from '../../modules/survey/analytics.source'
import type {FrozenUnitResult} from '../../modules/survey/final.compute'
afterAll(async()=>{await (await import('../../config/queue')).closeQueues(true);await (await import('../../config/database')).prisma.$disconnect()})
describe('deidentified export projects choices before reading excluded values',()=>{
 it('does not even visit a free-text/date value while preserving selected option codes',()=>{
  const read=vi.fn(()=>{throw Error('Excluded private field must not be projected')})
  const answers={choice:'yes'};Object.defineProperty(answers,'text',{enumerable:true,get:read});Object.defineProperty(answers,'date',{enumerable:true,get:read})
  const unit={rawAnswers:answers,missing:[],privateScoring:null} as unknown as FrozenUnitResult
  const items=[{itemKey:'text',answerKey:'text',responseType:'LONG_TEXT'},{itemKey:'date',answerKey:'date',responseType:'DATE'},{itemKey:'choice',answerKey:'choice',responseType:'SINGLE'}] as unknown as Parameters<typeof projectRawItems>[0]
  const projected=projectRawItems(items,unit,undefined,true)
  expect(projected.map(row=>[row.item.itemKey,row.value])).toEqual([['choice','yes']]);expect(read).not.toHaveBeenCalled()
  expect(()=>projectRawItems(items,unit)).toThrow('Excluded private field')
 })
})
