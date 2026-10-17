import {act,render,screen,waitFor} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {afterEach,describe,expect,it,vi} from 'vitest'
import {SurveyImageField} from './SurveyImageField'

const asset=(id='first')=>({assetId:id,contentHash:'a'.repeat(64),mimeType:'image/png',
  originalName:id+'.png',sizeBytes:1024})
const response=(data:unknown,status=200)=>Promise.resolve({ok:status<400,status,
  json:async()=>({code:status<400?0:-1,data,message:status===403?'素材库无权访问':'ok'})} as Response)
const deferred=<T,>()=>{
  let resolve!:(value:T)=>void,reject!:(error:Error)=>void
  const promise=new Promise<T>((done,fail)=>{resolve=done;reject=fail})
  return {promise,resolve,reject}
}
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})

describe('Survey image library explicit bounded reads',()=>{
  it('does not read a shared project library for 24 mounted fields until one is opened',async()=>{
    const user=userEvent.setup(),changed=vi.fn()
    let allowed=true
    const fetcher=vi.fn(()=>allowed?response({assets:[asset()]}):response(null,403))
    vi.stubGlobal('fetch',fetcher)
    render(<>{Array.from({length:24},(_,index)=><SurveyImageField key={index}
      projectId="project-a" onChange={changed}/>)}</>)
    await act(async()=>{await Promise.resolve()})
    expect(fetcher).not.toHaveBeenCalled()
    await user.click(screen.getAllByRole('button',{name:'打开本项目素材库'})[0])
    await screen.findByRole('option',{name:'first.png · 1 KB'})
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]).toEqual(['/api/survey/projects/project-a/assets',
      expect.objectContaining({credentials:'same-origin',cache:'no-store'})])
    await user.selectOptions(screen.getByLabelText('从本项目素材库选择'),'first')
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({asset:expect.objectContaining({assetId:'first'}),rightsStatus:'unknown'}))
    await user.click(screen.getByRole('button',{name:'收起本项目素材库'}))
    allowed=false
    await user.click(screen.getAllByRole('button',{name:'打开本项目素材库'})[0])
    await screen.findByRole('alert')
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('option',{name:'first.png · 1 KB'})).toBeNull()
    expect(screen.getByLabelText('从本项目素材库选择')).toBeDisabled()
    allowed=true
    await user.click(screen.getByRole('button',{name:'重试读取素材库'}))
    await screen.findByRole('option',{name:'first.png · 1 KB'})
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('uploads to the selected project without eagerly listing its library',async()=>{
    const user=userEvent.setup(),changed=vi.fn()
    const fetcher=vi.fn((url:string,init?:RequestInit)=>{
      if(url==='/api/survey/auth/csrf')return response({csrfToken:'synthetic-csrf'})
      if(url==='/api/survey/projects/project-b/assets'&&init?.method==='POST')return response(asset('uploaded'))
      throw new Error('Unexpected request '+url)
    })
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyImageField projectId="project-b" onChange={changed}/>)
    const file=new File(['synthetic bytes'],'chosen.png',{type:'image/png'})
    await user.upload(screen.getByLabelText('选择图片上传'),file)
    await waitFor(()=>expect(changed).toHaveBeenCalledTimes(1))
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({asset:expect.objectContaining({assetId:'uploaded'}),altText:'chosen'}))
    const uploads=fetcher.mock.calls.filter(([,init])=>init?.method==='POST')
    expect(uploads).toHaveLength(1)
    expect((uploads[0][1]?.body as FormData).get('image')).toBe(file)
    expect(fetcher.mock.calls.some(([url,init])=>url.endsWith('/assets')&&init?.method!=='POST')).toBe(false)
  })

  it.each(['success','failure'])('ignores late project-A library %s after switching to project B',async(outcome)=>{
    const user=userEvent.setup(),pending=deferred<Response>()
    const fetcher=vi.fn((url:string)=>url.includes('/project-a/')?pending.promise:response({assets:[asset('b')]}))
    vi.stubGlobal('fetch',fetcher)
    const view=render(<SurveyImageField projectId="project-a" onChange={vi.fn()}/>)
    await user.click(screen.getByRole('button',{name:'打开本项目素材库'}))
    view.rerender(<SurveyImageField projectId="project-b" onChange={vi.fn()}/>)
    expect(screen.queryByLabelText('从本项目素材库选择')).toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button',{name:'打开本项目素材库'}))
    await screen.findByRole('option',{name:'b.png · 1 KB'})
    await act(async()=>{
      if(outcome==='success')pending.resolve(await response({assets:[asset('a')]}))
      else pending.reject(new Error('旧项目的延迟错误'))
    })
    expect(screen.queryByRole('option',{name:'a.png · 1 KB'})).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('option',{name:'b.png · 1 KB'})).toBeInTheDocument()
    expect(screen.getByLabelText('从本项目素材库选择')).toBeEnabled()
  })
})
