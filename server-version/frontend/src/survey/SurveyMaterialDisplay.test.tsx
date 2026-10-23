import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest'
import {SurveyMaterialDisplay} from './SurveyMaterialDisplay'
const asset={assetId:'frozen',contentHash:'a'.repeat(64),mimeType:'video/mp4' as const}
const proof={publicId:'public',attemptId:'attempt',accessCredential:'private-proof'}
beforeEach(()=>vi.stubGlobal('URL',{createObjectURL:vi.fn().mockReturnValue('blob:material'),revokeObjectURL:vi.fn()}))
afterEach(()=>{cleanup();vi.unstubAllGlobals()})
describe('Survey participant material delivery',()=>{
  it('loads video only on demand, keeps the credential in POST, and releases bytes when closed',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,headers:{get:()=>asset.mimeType},blob:async()=>new Blob(['video'])})
    vi.stubGlobal('fetch',fetcher);render(<SurveyMaterialDisplay item={{asset,name:'研究视频'}} proof={proof}/>);expect(fetcher).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'查看视频'}));await waitFor(()=>expect(document.querySelector('video')).toHaveAttribute('src','blob:material'))
    const [url,init]=fetcher.mock.calls[0];expect(url).toBe('/api/public/survey/r/public/attempts/attempt/materials/frozen')
    expect(url).not.toContain(proof.accessCredential);expect(init.method).toBe('POST');expect(init.credentials).toBe('omit')
    expect(JSON.parse(init.body)).toEqual({accessCredential:proof.accessCredential});expect(document.querySelector('video')).toHaveAttribute('controls')
    fireEvent.click(screen.getByRole('button',{name:'收起素材'}));expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:material')
  })
  it('uses released report material authority and rejects a changed MIME type',async()=>{
    const fetcher=vi.fn().mockResolvedValue({ok:true,headers:{get:()=> 'text/html'}});vi.stubGlobal('fetch',fetcher)
    render(<SurveyMaterialDisplay purpose="report" item={{asset,name:'反馈视频'}} proof={proof}/>);fireEvent.click(screen.getByRole('button',{name:'查看视频'}))
    expect(await screen.findByRole('alert')).toHaveTextContent('类型不一致')
    expect(fetcher.mock.calls[0][0]).toContain('/report-materials/');expect(URL.createObjectURL).not.toHaveBeenCalled()
  })
  it('offers PDF preview in a sandbox and a local blob download without exposing the proof',async()=>{
    vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,headers:{get:()=> 'application/pdf'},blob:async()=>new Blob(['pdf'])}))
    render(<SurveyMaterialDisplay item={{asset:{...asset,mimeType:'application/pdf'},name:'研究文档'}} proof={proof}/>);fireEvent.click(screen.getByRole('button',{name:'查看PDF 文档'}))
    expect(await screen.findByTitle('研究文档')).toHaveAttribute('sandbox','')
    expect(screen.getByRole('link',{name:'下载 PDF 文档'})).toHaveAttribute('href','blob:material')
  })
})
