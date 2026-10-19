import {it,expect} from 'vitest'
import {sanitizeTrainingFormValues,trainingVisibleFields} from './training-policy'
import type {FormQuestion} from './types'
const q=(itemKey:string,patch:Partial<FormQuestion<never>>={}):FormQuestion<never>=>({itemKey,type:'SINGLE',prompt:itemKey,required:true,options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],rows:[],...patch})
it('uses stable keys while clearing hidden DB IDs, row objects and other text',()=>{
 const fields=[{formItemId:'db-a',formDefinition:q('stable-a')},{formItemId:'db-b',formDefinition:q('stable-b',{type:'MATRIX',rows:[{rowKey:'r',label:'行'}],displayIf:{itemKey:'stable-a',operator:'EQUALS',optionKey:'yes'}})}]
 const hidden={'db-a':'no','db-b':{r:'yes'},'db-b:other':'old'}
 expect(trainingVisibleFields(fields,hidden).map(f=>f.formItemId)).toEqual(['db-a'])
 expect(sanitizeTrainingFormValues(fields,hidden)).toEqual({'db-a':'no'})
 expect(trainingVisibleFields(fields,{'db-a':'yes'})).toHaveLength(2)
})
it('clears unselected other text and conditions after explicit refusal',()=>{
 const fields=[{formItemId:'db-a',formDefinition:q('stable-a',{otherOptionKey:'yes'})},{formItemId:'db-b',formDefinition:q('stable-b',{displayIf:{itemKey:'stable-a',operator:'EQUALS',optionKey:'yes'}})}]
 expect(sanitizeTrainingFormValues(fields,{'db-a':{_surveyRefusal:true},'db-a:other':'secret','db-b':'yes'})).toEqual({'db-a':{_surveyRefusal:true}})
})
