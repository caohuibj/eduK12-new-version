import {useState} from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,it,expect,vi} from 'vitest'
import {SurveyMaterialPicker} from './SurveyMaterialPicker'
import type {AssessmentMaterial} from '../modules/assessment-media/material'
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
function Editor(){const [items,setItems]=useState<AssessmentMaterial[]>([]);return <SurveyMaterialPicker value={items} onChange={setItems}/>}
describe('Survey reusable private media selection',()=>{
  it.each(['image/png','video/mp4','application/pdf'] as const)('selects %s through the private library, requiring an explicit use basis',async mimeType=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({code:0,data:{list:[{id:'asset',name:'本人素材',mimeType,contentHash:'a'.repeat(64),size:100}],total:1}})})
    vi.stubGlobal('fetch',fetcher);render(<Editor/>);expect(fetcher).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}));await screen.findByText('本人素材')
    expect(String(fetcher.mock.calls[0][0])).toContain('/media-library?source=owned')
    fireEvent.click(screen.getByRole('button',{name:'添加'}));expect(screen.getByLabelText('使用依据')).toHaveValue('unknown')
    fireEvent.change(screen.getByLabelText('使用依据'),{target:{value:'authorized'}})
    fireEvent.change(screen.getByLabelText('原创／授权说明'),{target:{value:'已取得研究展示许可'}})
    expect(screen.getByLabelText('原创／授权说明')).toHaveValue('已取得研究展示许可')
    expect(screen.getByRole('button',{name:'已添加'})).toBeDisabled()
    fireEvent.click(screen.getByRole('button',{name:'移除'}));expect(screen.getByRole('button',{name:'添加'})).toBeEnabled()
  })
  it('uses server-side type and page filters and reports a recoverable list failure',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>({code:0,data:{list:[],total:10}})})
    vi.stubGlobal('fetch',fetcher);render(<Editor/>);fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}))
    await screen.findByText('没有符合条件的素材。可切换类型，或到素材库上传后重新读取。')
    fireEvent.click(screen.getByRole('button',{name:'下一页'}));await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>String(url).includes('page=2'))).toBe(true))
    fireEvent.change(screen.getByLabelText('素材类型'),{target:{value:'document'}})
    await waitFor(()=>expect(fetcher.mock.calls.some(([url])=>String(url).includes('kind=document&page=1'))).toBe(true))
    fetcher.mockResolvedValueOnce({ok:false,json:async()=>({code:-1,message:'暂不可用'})})
    fireEvent.click(screen.getByRole('button',{name:'重新读取'}));expect(await screen.findByRole('alert')).toHaveTextContent('暂不可用')
  })
})
