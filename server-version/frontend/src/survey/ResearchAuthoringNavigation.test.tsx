import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResearchScaleEditor } from './ResearchScaleEditor'
import { SurveyBuilder } from './SurveyBuilder'
import type { ScaleDraft } from './builder.types'
const scale:ScaleDraft={schemaVersion:1,respondentType:'participant_self_report',aggregation:'mean',responseOptions:[{optionKey:'yes',label:'同意',score:1}],dimensions:[],items:[
  {itemKey:'q1',prompt:'第一道题',required:true,reverse:false,dimensionKeys:[]},
  {itemKey:'q2',prompt:'第二道题',required:true,reverse:false,dimensionKeys:[]},
]}
function Editor(){const [value,setValue]=useState(scale);return <ResearchScaleEditor value={value} onChange={setValue}/>}
afterEach(()=>vi.unstubAllGlobals())
describe('research authoring navigation and accessible controls',()=>{
  it('names each move, copy and delete control with its current question number',()=>{
    render(<Editor/>)
    expect(screen.getByRole('button',{name:'上移第 1 题'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'下移第 2 题'})).toBeDisabled()
    expect(screen.getByRole('button',{name:'复制第 1 题'})).toBeEnabled()
    fireEvent.click(screen.getByRole('button',{name:'上移第 2 题'}))
    expect(screen.getByLabelText('题干 1')).toHaveValue('第二道题')
    fireEvent.click(screen.getByRole('button',{name:'删除第 1 题'}))
    expect(screen.getByLabelText('题干 1')).toHaveValue('第一道题')
    expect(screen.queryByLabelText('题干 2')).toBeNull()
  })
  it('renders one native collapsible navigation with exact anchors and preserves unknown statuses',async()=>{
    const draft={id:'form',projectId:'p',instrumentKey:'form-key',kind:'FORM',title:'表单示例',revision:7,status:'DRAFT',definition:{schemaVersion:1,pages:[{pageKey:'page',title:'第一页',questions:[{itemKey:'question',type:'SHORT_TEXT',prompt:'导航目标题',required:true,options:[],rows:[]}]}]}}
    vi.stubGlobal('fetch',vi.fn(async(url:string)=>({ok:true,json:async()=>({code:0,data:url.endsWith('/instruments/form')?draft:url.includes('/instruments?page=')?{list:[draft,{...draft,id:'future',title:'未来状态',status:'FUTURE_STATUS'}]}:url.endsWith('/assets')?{assets:[]}:{list:[]}})})))
    render(<SurveyBuilder projectId="p"/>)
    fireEvent.click(await screen.findByRole('button',{name:/表单示例 FORM/}))
    await screen.findByLabelText('研究工具名称')
    expect(screen.getAllByRole('complementary',{name:'研究工具属性与题目导航'})).toHaveLength(1)
    const navigation=screen.getByRole('complementary',{name:'研究工具属性与题目导航'})
    expect(navigation).not.toHaveClass('hidden')
    expect(navigation.querySelector('details')).not.toHaveAttribute('open')
    const summary=navigation.querySelector('summary')!
    expect(summary).toHaveTextContent('属性与题目导航')
    fireEvent.click(summary)
    expect(navigation.querySelector('details')).toHaveAttribute('open')
    expect(within(navigation).getByRole('link',{name:'导航目标题'})).toHaveAttribute('href','#survey-form-question')
    expect(document.querySelectorAll('#survey-form-question')).toHaveLength(1)
    expect(screen.getByRole('link',{name:'查看当前工具属性与题目导航'})).toHaveAttribute('href','#survey-tool-navigation')
    expect(screen.getByRole('button',{name:/未来状态/})).toHaveTextContent('FUTURE_STATUS')
    expect(screen.getByRole('button',{name:/表单示例 FORM/})).toHaveTextContent('FORM · 表单 · 修订 7 · 草稿')
  })
})
