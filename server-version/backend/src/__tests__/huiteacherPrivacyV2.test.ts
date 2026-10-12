import {afterEach,describe,expect,it} from 'vitest'
import {STANDARD,ENHANCED} from '../modules/report-privacy/registry'
import {
  teacherPrivacyV2Enabled,teacherReportMinimum,
  parseFrozenTeacherOptions,
} from '../modules/huiteacher/privacyV2'
import {
  createProtectedFormItems,recordProtectedFormAnswers,discloseProtectedFormItems,
} from '../modules/huiteacher/groupReport.service'
import type {FormDraft} from '../modules/survey/builder.definition'

const saved={a:process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED,
  b:process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED}
afterEach(()=>{
  if(saved.a===undefined)delete process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED
  else process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED=saved.a
  if(saved.b===undefined)delete process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED
  else process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED=saved.b
})
const form:FormDraft={schemaVersion:2,pages:[{pageKey:'page',title:'课堂教学',
  questions:[
    {itemKey:'rating',type:'SINGLE',prompt:'我的课堂体验',required:true,rows:[],
      options:[{optionKey:'positive',label:'积极'},{optionKey:'negative',label:'消极'}]},
    {itemKey:'comment',type:'LONG_TEXT',prompt:'个人意见',required:false,rows:[],
      options:[],maxLength:400},
  ],
}]}

describe('Teacher V2 report/privacy policy and output projection',()=>{
  it('cannot turn on V2 consumers with only one feature flag',()=>{
    process.env.REPORT_PRIVACY_TEACHER_V2_ENABLED='true'
    delete process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED
    expect(teacherPrivacyV2Enabled()).toBe(false)
    process.env.REPORT_PRIVACY_PREFERENCES_V1_ENABLED='true'
    expect(teacherPrivacyV2Enabled()).toBe(true)
    expect(teacherReportMinimum(STANDARD)).toBe(5)
    expect(teacherReportMinimum(ENHANCED)).toBe(10)
    expect(teacherReportMinimum(STANDARD,10)).toBe(10)
  })
  it('parses an exact frozen server-owned Teacher policy, not a browser preference',()=>{
    const snapshot={schemaVersion:1,product:'HUITEACHER',
      scenario:'TEACHER_STUDENT_EVALUATION',options:STANDARD,
      source:'APPROVED_REPORT_PREFERENCE_V1'}
    expect(parseFrozenTeacherOptions(snapshot,'TEACHER_STUDENT_EVALUATION')).toEqual(STANDARD)
    expect(()=>parseFrozenTeacherOptions(snapshot,'TEACHER_ADULT_FORM_GROUP')).toThrow()
    expect(()=>parseFrozenTeacherOptions({...snapshot,options:{...STANDARD,
      allowRawAnswers:true}},'TEACHER_STUDENT_EVALUATION')).toThrow()
  })
  it('standard mode shows the sparse single-choice cell; enhanced mode hides whole question',()=>{
    const items=createProtectedFormItems(form)
    for(let i=0;i<10;i++)recordProtectedFormAnswers(items,{
      rating:i<9?'positive':'negative',
    },[{itemKey:'comment',reason:'NOT_SHOWN'}])
    const legacy=discloseProtectedFormItems(items,10)
    const normal=discloseProtectedFormItems(items,10,STANDARD)
    const strict=discloseProtectedFormItems(items,10,ENHANCED)
    expect(legacy[0]).toMatchObject({status:'WITHHELD',reason:'SMALL_CELL'})
    expect(normal[0]).toMatchObject({status:'READY'})
    expect(normal[0].cells?.find(x=>x.key==='negative')).toMatchObject({count:1})
    expect(strict[0]).toMatchObject({status:'WITHHELD',reason:'SMALL_CELL'})
    for(const projection of [legacy,normal,strict]){
      expect(projection[1]).toMatchObject({status:'WITHHELD',reason:'PRIVATE_FREE_TEXT'})
      expect(JSON.stringify(projection)).not.toContain('personal raw comment')
    }
  })
  it('restricted numeric projections return coarse percentages without exact cells',()=>{
    const items=createProtectedFormItems(form)
    for(let i=0;i<10;i++)recordProtectedFormAnswers(items,{
      rating:i<8?'positive':'negative',
    },[{itemKey:'comment',reason:'NOT_SHOWN'}])
    const rounded=discloseProtectedFormItems(items,10,{
      ...STANDARD,restrictedStatisticsProjection:true,
    })
    expect(rounded[0]).toMatchObject({status:'READY',precision:'ROUNDED_10_PERCENT'})
    expect(rounded[0].cells?.find(x=>x.key==='negative')).toMatchObject({percentage:20})
    expect(rounded[0].cells?.find(x=>x.key==='negative')).not.toHaveProperty('count')
    const blocked=discloseProtectedFormItems(items,10,{
      ...STANDARD,restrictItemDistributions:true,
    })
    expect(blocked[0]).toMatchObject({
      status:'WITHHELD',reason:'POLICY_ITEM_DISTRIBUTION',
    })
  })
})
