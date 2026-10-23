import {describe,expect,it} from 'vitest'
import {choiceReferenceError,planFormBulkChoices,referencedFormChoiceKeys} from './choiceSafety'
import type {FormChoiceRow} from './FormChoiceRows'

const existing=[{id:'row-a',value:'custom_a',label:'甲'},{id:'row-b',value:'option_1',label:'其他'},{id:'row-c',value:'custom_c',label:'均无'}]
const create=(rows:FormChoiceRow[],label:string)=>{let n=1;while(rows.some(row=>row.value==='option_'+n))n++;return {id:'fresh-'+n,value:'option_'+n,label}}
describe('Shared Form identity and reference safety',()=>{
  it('retains positional identities and allocates collision-free extra codes for text replacement',()=>{
    const plan=planFormBulkChoices({existing,lines:['新甲','新乙','新丙','新增'].map(label=>({label})),mode:'replace',create,maximum:30})
    expect(plan.error).toBe('')
    expect(plan.next.slice(0,3).map(({id,value})=>({id,value}))).toEqual(existing.map(({id,value})=>({id,value})))
    expect(plan.next[3].value).toBe('option_2')
  })
  it('preserves identities by explicit code even when coded rows change order',()=>{
    const plan=planFormBulkChoices({existing,lines:[{code:'custom_c',label:'第三项'},{code:'custom_a',label:'第一项'}],mode:'replace',coded:true,create,maximum:30,protectedKeys:['custom_c']})
    expect(plan.error).toBe('');expect(plan.next.map(row=>row.id)).toEqual(['row-c','row-a'])
  })
  it('collects own and dependent references and blocks removing or changing their keys',()=>{
    const keys=referencedFormChoiceKeys({itemKey:'source',otherOptionKey:'option_1',exclusiveOptionKeys:['custom_c']},[{displayIf:{itemKey:'source',optionKey:'custom_a'}},{displayIf:{itemKey:'unrelated',optionKey:'irrelevant'}}])
    expect(new Set(keys)).toEqual(new Set(existing.map(row=>row.value)))
    expect(choiceReferenceError(existing,existing.slice(0,2),keys)).toContain('条件显示')
    expect(choiceReferenceError(existing,[...existing].reverse(),keys)).toBe('')
  })
})
