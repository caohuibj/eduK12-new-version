import {useState} from 'react'
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import type {AssessmentMaterial} from '../material'
const api=vi.hoisted(()=>({get:vi.fn(),fetch:vi.fn()}))
vi.mock('../../../api/client',()=>({default:{get:api.get},sessionFetch:api.fetch}))
import {TrainingMaterialPicker,TrainingMaterials} from '../TrainingMaterialPicker'
function Editor(){const [value,onChange]=useState<AssessmentMaterial[]>([]);return <><TrainingMaterialPicker value={value} onChange={onChange} label="题目展示素材"/><output>{JSON.stringify(value)}</output></>}
beforeEach(()=>vi.resetAllMocks())
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Training uses shared assessment materials',()=>{
  it.each(['image/png','video/mp4','application/pdf'] as const)('selects %s using the assessment capability and immutable identity',async mimeType=>{
    api.get.mockResolvedValue({code:0,data:{list:[{id:'asset',contentHash:'a'.repeat(64),mimeType,name:'已有素材',size:100,url:'https://temporary.invalid/url'}],total:1,pageSize:9}})
    render(<Editor/>);expect(api.get).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}));await screen.findByText('已有素材')
    expect(api.get).toHaveBeenCalledWith('/training-workspace/media',{params:{kind:'all',page:1,pageSize:9,usage:'assessment'}})
    fireEvent.click(screen.getByRole('button',{name:'添加'}));expect(screen.getByLabelText('使用依据')).toHaveValue('unknown')
    fireEvent.change(screen.getByLabelText('使用依据'),{target:{value:'authorized'}})
    fireEvent.change(screen.getByLabelText('原创／授权说明'),{target:{value:'本次使用许可'}})
    expect(screen.getByRole('status')).toHaveTextContent('本次使用许可')
    expect(screen.getByRole('status')).not.toHaveTextContent('https://')
    expect(screen.getByRole('button',{name:'已添加'})).toBeDisabled()
    expect(document.querySelector('[data-appearance="training"]')).not.toBeNull()
  })
  it('keeps a failed list recoverable and prevents changes in read-only mode',async()=>{
    api.get.mockResolvedValue({code:-1,message:'授权已变化'})
    const {rerender}=render(<TrainingMaterialPicker value={[]} onChange={()=>{}}/>);fireEvent.click(screen.getByRole('button',{name:'从素材库添加'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('授权已变化')
    rerender(<TrainingMaterialPicker value={[]} onChange={()=>{}} disabled/>);expect(screen.getByRole('button',{name:'收起素材库'})).toBeDisabled()
  })
  it('does not hide a real MIME mismatch behind the expected type',async()=>{
    vi.stubGlobal('URL',{createObjectURL:vi.fn(),revokeObjectURL:vi.fn()})
    const item={asset:{assetId:'asset',contentHash:'a'.repeat(64),mimeType:'application/pdf' as const},name:'说明文档'}
    const load=vi.fn().mockResolvedValue(new Blob(['invalid'],{type:'text/html'}))
    render(<TrainingMaterials items={[item]} loadAsset={load}/>);fireEvent.click(screen.getByRole('button',{name:'查看PDF 文档'}))
    await waitFor(()=>expect(screen.getByRole('alert')).toHaveTextContent('类型不一致'))
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
})
