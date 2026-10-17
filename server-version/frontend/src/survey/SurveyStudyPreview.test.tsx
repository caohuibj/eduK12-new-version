import { fireEvent,render,screen } from '@testing-library/react'
import { describe,expect,it } from 'vitest'
import { SurveyStudyPreview } from './SurveyStudyPreview'
import type { ResearchDraft } from './builder.types'
const form:ResearchDraft={id:'form-id',projectId:'project',instrumentKey:'form',kind:'FORM',title:'筛选',revision:1,status:'DRAFT',createdAt:'',updatedAt:'',definition:{schemaVersion:1,pages:[{pageKey:'p',title:'筛选页',questions:[{itemKey:'eligible',prompt:'符合吗',type:'SINGLE',required:true,options:[{optionKey:'yes',label:'符合条件'},{optionKey:'no',label:'不符合条件'}],rows:[]}]}]}}
const cog:ResearchDraft={...form,id:'cog-id',instrumentKey:'cog',kind:'COGNITIVE',title:'认知任务',definition:{schemaVersion:1,templateKey:'gonogo-software-frame-v1',feedback:{mode:'DESCRIPTIVE',metricKeys:['hitRate'],release:'AFTER_FINAL'}}}
describe('Researcher full study preview',()=>{
  it('executes conditional paths with test answers and marks a screened-out ending as preview only',async()=>{
    render(<SurveyStudyPreview drafts={[form,cog]} cognitiveSnapshots={{}} consentText="说明" generalText="谢谢" onClose={()=>{}}
      flow={{schemaVersion:1,embeddedData:[],blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:'form'},{blockKey:'screen',kind:'END',termination:'SCREEN_OUT',when:{op:'EQUALS',field:{source:'ANSWER',instrumentKey:'form',itemKey:'eligible'},value:'no'}},{blockKey:'cog',kind:'INSTRUMENT',instrumentKey:'cog'}]}}/>)
    fireEvent.click(screen.getByRole('button',{name:'模拟同意并进入预览'}));fireEvent.click(screen.getByRole('radio',{name:'不符合条件'}))
    fireEvent.click(screen.getByRole('button',{name:'下一步预览'}));expect(screen.getByText('资格筛除结束：')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'查看预览结束说明'}));expect(screen.getByText(/本测试答案进入资格筛除路径/)).toBeInTheDocument()
    expect(screen.getByText(/没有创建参与者、任务子结果或整轮 FINAL/)).toBeInTheDocument()
  })
  it('keeps skipped cognitive preview visibly unverified rather than inventing a score',()=>{
    render(<SurveyStudyPreview drafts={[cog]} cognitiveSnapshots={{}} consentText="说明" generalText="谢谢" flow={null} onClose={()=>{}}/>)
    fireEvent.click(screen.getByRole('button',{name:'模拟同意并进入预览'}));expect(screen.getByRole('button',{name:'查看预览结束说明'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'仅预览：跳过此任务操作并检查后续路径'}));fireEvent.click(screen.getByRole('button',{name:'查看预览结束说明'}))
    expect(screen.getByText(/跳过了 1 个认知任务预览/)).toBeInTheDocument();expect(screen.getByText(/预览不编造数值/)).toBeInTheDocument()
  })
})

it('simulates the chosen questionnaire arm without rendering the other arm or an empty material step',()=>{
  const other:ResearchDraft={...form,id:'other-id',instrumentKey:'other',title:'另一子版本',definition:{schemaVersion:1,pages:[{pageKey:'other',title:'另一页',questions:[{itemKey:'other',prompt:'另一子版本问题',type:'SHORT_TEXT',required:false,options:[],rows:[]}]}]}}
  render(<SurveyStudyPreview drafts={[form,other]} cognitiveSnapshots={{}} consentText="说明" generalText="谢谢" onClose={()=>{}}
    flow={{schemaVersion:1,embeddedData:[],experiment:{mode:'QUESTIONNAIRE_VARIANTS',experimentKey:'exp',linkedPolicy:'RERANDOMIZE',groups:[
      {groupKey:'a',variantLabel:'问卷 A',weight:1,instrumentKeys:['form'],materialTitle:'',materialBody:''},
      {groupKey:'b',variantLabel:'问卷 B',weight:1,instrumentKeys:['other'],materialTitle:'',materialBody:''},
    ]},blocks:[{blockKey:'form',kind:'INSTRUMENT',instrumentKey:'form'},{blockKey:'other',kind:'INSTRUMENT',instrumentKey:'other'}]}}/>)
  fireEvent.change(screen.getByLabelText('模拟预览 A/B问卷子版本（不进行正式随机分配）'),{target:{value:'b'}})
  fireEvent.click(screen.getByRole('button',{name:'模拟同意并进入预览'}))
  expect(screen.getByText('预览步骤 1 / 1')).toBeInTheDocument()
  expect(screen.getByText(/另一子版本问题/)).toBeInTheDocument()
  expect(screen.queryByText('符合吗')).not.toBeInTheDocument()
})
