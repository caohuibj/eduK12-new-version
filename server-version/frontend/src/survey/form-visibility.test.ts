import { describe,expect,it } from 'vitest'
import { sanitizeFormAnswers,visibleFormKeys,type ConditionalFormItem } from './form-visibility'

const chain:ConditionalFormItem[]=[
  {itemKey:'first'},
  {itemKey:'second',displayIf:{itemKey:'first',operator:'EQUALS',optionKey:'show'}},
  {itemKey:'third',displayIf:{itemKey:'second',operator:'EQUALS',optionKey:'yes'}},
  {itemKey:'rows',rows:[{rowKey:'one'},{rowKey:'two'}],
    displayIf:{itemKey:'third',operator:'EQUALS',optionKey:'go'}},
]
describe('Survey Form conditional answer projection',()=>{
  it('uses only visible ancestors, excluding stale descendants and matrix rows',()=>{
    const answers={first:'hide',second:'yes',third:'go',
      'rows:one':'a','rows:two':'b',rows:'illegal'}
    expect([...visibleFormKeys(chain,answers)]).toEqual(['first'])
    expect(sanitizeFormAnswers(chain,answers)).toEqual({first:'hide'})
    expect(answers['rows:one']).toBe('a') // projection does not mutate local drafts
  })
  it('preserves chains only when every preceding condition is satisfied',()=>{
    const answers={first:'show',second:'yes',third:'go','rows:one':'a','rows:two':'b'}
    expect([...visibleFormKeys(chain,answers)]).toEqual(['first','second','third','rows'])
    expect(sanitizeFormAnswers(chain,answers)).toEqual(answers)
  })
  it('handles INCLUDES over prior multi-select answers without using hidden values',()=>{
    const questions:ConditionalFormItem[]=[
      {itemKey:'multi'},
      {itemKey:'follow',displayIf:{itemKey:'multi',operator:'INCLUDES',optionKey:'o2'}},
      {itemKey:'final',displayIf:{itemKey:'follow',operator:'EQUALS',optionKey:'agree'}},
    ]
    expect([...visibleFormKeys(questions,{multi:['o1'],follow:'agree',final:'hidden'})])
      .toEqual(['multi'])
    expect([...visibleFormKeys(questions,{multi:['o2'],follow:'agree'})])
      .toEqual(['multi','follow','final'])
  })
})
