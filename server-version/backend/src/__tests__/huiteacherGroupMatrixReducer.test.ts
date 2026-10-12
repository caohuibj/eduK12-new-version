import {describe,expect,it} from 'vitest'
import {dryRunSurveyForm} from '../../modules/survey/final.compute'
import type {FormDraft} from '../../modules/survey/builder.definition'
import {
  createProtectedFormItems,recordProtectedFormAnswers,discloseProtectedFormItems,
} from '../../modules/huiteacher/groupReport.service'

/** Deterministic reducer contracts share the REAL Survey V2 final
 * normalizer used at Teacher FINAL. This test has no mock scorer nor DB.
 * It does not replace the frozen Run/FINAL PostgreSQL tests.
 */
const form:FormDraft={
  schemaVersion:2,pages:[{pageKey:'p1',title:'矩阵及拒答保护',
    questions:[
      {itemKey:'matrix',type:'MATRIX',prompt:'课堂观察',
        required:false,allowRefusal:true,
        options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}],
        rows:[{rowKey:'r1',label:'观察一'},{rowKey:'r2',label:'观察二'}]},
      {itemKey:'choice',type:'SINGLE',prompt:'单选拒答',
        required:false,allowRefusal:true,rows:[],
        options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}]},
      {itemKey:'multi',type:'MATRIX_MULTIPLE',prompt:'课堂多选矩阵',
        required:false,rows:[{rowKey:'r1',label:'选择一'}],
        options:[{optionKey:'yes',label:'是'},{optionKey:'no',label:'否'}]},
      {itemKey:'text',type:'LONG_TEXT',prompt:'开放性意见',
        required:false,rows:[],options:[],maxLength:300},
    ],
  }],
}
const refusal={_surveyRefusal:true}
const outcome=(i:number)=>{
  const answers={
    'matrix:r1':i<5?refusal:'yes',
    'matrix:r2':i<5?'no':'yes',
    choice:i<5?refusal:'yes',
    'multi:r1':i<5?['yes']:['no'],
    text:'原始意见不允许直接发布',
  }
  return dryRunSurveyForm(form,answers)
}
const cell=(item:{cells?:Array<{key:string;count:number}>}|undefined,
  key:string)=>item?.cells?.find(row=>row.key===key)?.count
describe('Huiteacher Form-only aggregate reducer consumes Survey V2 FINAL',()=>{
  it('uses matrix parent-key row maps, not wire-level q:row fields',()=>{
    const items=createProtectedFormItems(form)
    for(let i=0;i<10;i++){
      const result=outcome(i)
      if(i===0){
        expect(result.rawAnswers.matrix).toMatchObject({r2:'no'})
        expect(result.rawAnswers['matrix:r2']).toBeUndefined()
        expect(result.missing).toContainEqual({itemKey:'matrix:r1',reason:'REFUSED'})
        expect(result.missing).toContainEqual({itemKey:'choice',reason:'REFUSED'})
      }
      recordProtectedFormAnswers(items,result.rawAnswers,result.missing)
    }
    const projected=discloseProtectedFormItems(items,10)
    const r1=projected.find(x=>x.itemKey==='matrix:r1')
    const r2=projected.find(x=>x.itemKey==='matrix:r2')
    const choice=projected.find(x=>x.itemKey==='choice')
    const multiple=projected.find(x=>x.itemKey==='multi:r1')
    expect(r1?.status).toBe('READY')
    expect(r2?.status).toBe('READY')
    expect(choice?.status).toBe('READY')
    expect(multiple?.status).toBe('READY')
    expect(cell(r1,'REFUSED')).toBe(5)
    expect(cell(r1,'yes')).toBe(5)
    expect(cell(r1,'MISSING')).toBe(0)
    expect(cell(r2,'yes')).toBe(5)
    expect(cell(r2,'no')).toBe(5)
    expect(cell(choice,'REFUSED')).toBe(5)
    expect(cell(choice,'yes')).toBe(5)
    expect(cell(multiple,'yes')).toBe(5)
    expect(cell(multiple,'no')).toBe(5)
    expect(projected.find(x=>x.itemKey==='text')?.status).toBe('WITHHELD')
  })
  it('preserves small-cell suppression after correct matrix normalization',()=>{
    const items=createProtectedFormItems(form)
    for(let i=0;i<10;i++){
      const result=dryRunSurveyForm(form,{
        'matrix:r1':i===0?'no':'yes','matrix:r2':i<5?'no':'yes',
        choice:'yes','multi:r1':['yes'],
      })
      recordProtectedFormAnswers(items,result.rawAnswers,result.missing)
    }
    const result=discloseProtectedFormItems(items,10)
    expect(result.find(x=>x.itemKey==='matrix:r1')).toMatchObject({
      status:'WITHHELD',reason:'SMALL_CELL',
    })
    expect(result.find(x=>x.itemKey==='matrix:r2')?.status).toBe('READY')
  })
  it('rejects contradictory canonical answers and missing reasons',()=>{
    const items=createProtectedFormItems(form)
    expect(()=>recordProtectedFormAnswers(items,{
      matrix:{r1:'yes',r2:'no'},choice:'yes',multi:{r1:['yes']},
    },[{itemKey:'matrix:r1',reason:'REFUSED'}])).toThrow()
  })
})
