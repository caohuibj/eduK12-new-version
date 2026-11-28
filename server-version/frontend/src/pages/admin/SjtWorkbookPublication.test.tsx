import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SjtWorkbookPublication } from './SjtWorkbookPublication'

const calls=vi.hoisted(()=>({ upload:vi.fn(), governed:vi.fn() }))
vi.mock('../../api/client',()=>({ sessionFetch:calls.upload }))
vi.mock('../../api/surveyGovernance',()=>({ governedRequest:calls.governed }))

describe('platform SJT workbook intake',()=>{
  beforeEach(()=>vi.clearAllMocks())

  it('requires a preview of the exact report revision before platform submission', async ()=>{
    const onSaved=vi.fn().mockResolvedValue(undefined)
    const template={ instrumentKey:'synthetic-sjt', instrumentVersion:'2.0.0', title:'合成工作簿',
      metrics:[{ metricKey:'effort', label:'合成指标' }] }
    calls.upload.mockResolvedValue({ok:true,json:async()=>({code:0,data:{template}})})
    calls.governed.mockImplementation(async (_scope:string,path:string,body:Record<string,unknown>)=>
      path.endsWith('/preview')?{title:template.title,contentVersion:template.instrumentVersion,
        releaseVersion:body.releaseVersion,reportVersion:body.reportVersion,metricKeys:['effort']}
        :{id:'synthetic-release',state:'SUBMITTED'})
    render(<SjtWorkbookPublication onSaved={onSaved}/>)
    fireEvent.click(screen.getByText('导入 SJT 标准工作簿'))
    fireEvent.change(screen.getByLabelText('Excel 工作簿'),{
      target:{files:[new File(['synthetic'],'example.xlsx')]},
    })
    fireEvent.click(screen.getByRole('button',{name:'读取工作簿'}))
    await screen.findByText('合成工作簿')
    fireEvent.change(screen.getByLabelText('内容与素材授权声明'),{target:{value:'合成测试'}})
    const submit=screen.getByRole('button',{name:'提交平台审核'})
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button',{name:'核对并预览发布内容'}))
    await waitFor(()=>expect((submit as HTMLButtonElement).disabled).toBe(false))
    fireEvent.change(screen.getByLabelText('报告版本'),{target:{value:'1.0.1'}})
    expect((submit as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button',{name:'核对并预览发布内容'}))
    await waitFor(()=>expect((submit as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(submit)
    await waitFor(()=>expect(onSaved).toHaveBeenCalledOnce())
    expect(calls.upload).toHaveBeenCalledWith('/api/situational/authoring/validate',
      expect.objectContaining({method:'POST',body:expect.any(FormData)}))
    expect(calls.governed).toHaveBeenLastCalledWith('survey-tools','/original-sjt/workbook/submit',
      expect.objectContaining({template,reportVersion:'1.0.1',reportVisibility: expect.objectContaining({
        policyVersion:'1.0.1',audiences:expect.not.objectContaining({respondent:expect.anything()}),
      })}))
  })
})
