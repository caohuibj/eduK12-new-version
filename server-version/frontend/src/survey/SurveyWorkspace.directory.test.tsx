import {act,fireEvent,render,screen,waitFor,within} from '@testing-library/react'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import SurveyApp from './SurveyApp'
import {SurveyProjectDirectory,type SurveyProject} from './SurveyProjectDirectory'

vi.mock('./SurveyProjectTools',()=>({SurveyProjectTools:()=>null}))
vi.mock('./SurveyReportStudio',()=>({SurveyReportStudio:()=>null}))
vi.mock('./SurveyWaveStudio',()=>({SurveyWaveStudio:()=>null}))
vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:()=>null}))
const projects=[
  {id:'draft',title:'学习体验研究',description:'第一项研究说明',status:'DRAFT',collectionMode:'SINGLE_UNLINKED',revision:1},
  {id:'active',title:'长期跟踪研究',description:'第二项研究说明',status:'ACTIVE',collectionMode:'LINKED_WAVES',revision:2},
]
const reply=(data:unknown,ok=true)=>Promise.resolve({ok,json:async()=>({code:ok?0:503,data,message:ok?'ok':'研究列表暂不可用'})} as Response)
beforeEach(()=>{
  window.history.replaceState(null,'','/workspace')
  vi.stubGlobal('fetch',vi.fn((url:string)=>{
    if(url.endsWith('/auth/me'))return reply({id:'r',username:'研究者',mustChangePassword:false})
    if(url.endsWith('/auth/capabilities'))return reply({analytics:true,publication:true})
    if(url.includes('/tool-library?')||url.includes('/media-library?'))return reply({list:[],total:0})
    if(url.includes('/projects?page=')){
      const params=new URL(url,'http://local.test').searchParams,q=params.get('q')||'',status=params.get('status')
      const list=projects.filter(p=>(!q||(p.title+' '+p.description).includes(q))&&(!status||p.status===status))
      return reply({list,total:list.length,page:1,hasNext:false})
    }
    throw new Error('Unexpected request '+url)
  }))
})
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})
function renderCards(project:SurveyProject,busy=false){
  const onChoose=vi.fn(),onArchive=vi.fn()
  render(<SurveyProjectDirectory projects={[project]} page={1} busy={busy} loading={false} error="" query="" status=""
    onQuery={vi.fn()} onStatus={vi.fn()} onChoose={onChoose} onArchive={onArchive} onPage={vi.fn()} onRefresh={vi.fn()} onCreate={vi.fn()}/>)
  return {onChoose,onArchive}
}
describe('Survey researcher directory and editing context',()=>{
  it('clears a stale data-page anchor on the directory without guessing a project or changing the session',async()=>{
    window.history.replaceState(null,'','/workspace#survey-data-overview')
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    await waitFor(()=>expect(window.location.hash).toBe(''))
    expect(window.location.pathname).toBe('/workspace')
    expect(window.location.search).toBe('')
    expect(vi.mocked(fetch).mock.calls.some(([url])=>/\/projects\/[^?]+$/.test(String(url)))).toBe(false)
    expect(screen.getByRole('heading',{name:'学习体验研究'})).toBeVisible()
  })
  it('keeps hash-only navigation inside the current editor without discarding edits or issuing requests',async()=>{
    render(<SurveyApp/>)
    fireEvent.click((await screen.findAllByRole('button',{name:'查看/编辑'}))[0])
    fireEvent.change(await screen.findByLabelText('研究名称'),{target:{value:'尚未保存的名称'}})
    const requests=vi.mocked(fetch).mock.calls.length
    const url=new URL(window.location.href);url.hash='survey-project-save'
    window.history.pushState(null,'',url.pathname+url.search+url.hash);fireEvent.popState(window)
    expect(screen.getByRole('heading',{name:'编辑研究草稿'})).toBeVisible()
    expect(screen.getByLabelText('研究名称')).toHaveValue('尚未保存的名称')
    expect(screen.queryByRole('navigation',{name:'编辑研究草稿快捷导航'})).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls).toHaveLength(requests)
  })

  it('records the current study and section in the URL and restores saved server content after remount',async()=>{
    const base=vi.mocked(fetch).getMockImplementation()!
    vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>url.endsWith('/projects/draft')?reply(projects[0]):base(url,options)))
    const page=render(<SurveyApp/>)
    fireEvent.click((await screen.findAllByRole('button',{name:'查看/编辑'}))[0])
    fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'未保存的本地名称'}})
    await waitFor(()=>expect(new URLSearchParams(window.location.search).get('section')).toBe('publish'))
    expect(new URLSearchParams(window.location.search).get('project')).toBe('draft')
    page.unmount();render(<SurveyApp/>)
    expect(await screen.findByRole('tab',{name:'发布与采集'})).toHaveAttribute('aria-selected','true')
    expect(screen.getByLabelText('研究名称')).toHaveValue(projects[0].title)
    expect(screen.getByRole('heading',{name:projects[0].title,level:1})).toBeVisible()
    const calls=vi.mocked(fetch).mock.calls.map(([url])=>String(url))
    expect(calls.filter(url=>url.endsWith('/projects/draft'))).toHaveLength(1)
    expect(calls.findIndex(url=>url.endsWith('/auth/me'))).toBeLessThan(calls.findIndex(url=>url.endsWith('/projects/draft')))
  })

  it('restores a permitted study outside the first list page and rejects unavailable studies without dropping the session',async()=>{
    const base=vi.mocked(fetch).getMockImplementation()!
    const target={...projects[0],id:'outside-page',title:'分页之外的研究'}
    vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>{
      if(url.endsWith('/projects/outside-page'))return reply(target)
      if(url.endsWith('/projects/unavailable'))return Promise.resolve({ok:false,json:async()=>({code:403,message:'研究项目不可用'})} as Response)
      return base(url,options)
    }))
    window.history.replaceState(null,'','/workspace?project=outside-page&section=invalid')
    const page=render(<SurveyApp/>)
    expect(await screen.findByRole('heading',{name:target.title,level:1})).toBeVisible()
    expect(screen.getByRole('tab',{name:'研究设置'})).toHaveAttribute('aria-selected','true')
    page.unmount();window.history.replaceState(null,'','/workspace?project=unavailable&section=tools');render(<SurveyApp/>)
    expect(await screen.findByRole('alert')).toHaveTextContent('研究项目不可用')
    expect(screen.getByRole('heading',{name:'研究工作台'})).toBeVisible()
    expect(screen.queryByRole('heading',{name:'研究者登录'})).not.toBeInTheDocument()
    expect(screen.queryByLabelText('研究名称')).not.toBeInTheDocument()
  })

  it('does not read a URL-selected study before researcher authentication',async()=>{
    window.history.replaceState(null,'','/workspace?project=draft&section=tools')
    vi.stubGlobal('fetch',vi.fn(()=>reply(null,false)))
    render(<SurveyApp/>)
    expect(await screen.findByRole('heading',{name:'研究者登录'})).toBeVisible()
    expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).includes('/projects'))).toBe(false)
  })

  it('dismisses save success five seconds after the latest acknowledgement while retaining errors',async()=>{
    let current={...projects[0]},failSave=false,writes=0
    vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>{
      if(url.endsWith('/auth/me'))return reply({id:'r',username:'研究者',mustChangePassword:false})
      if(url.endsWith('/auth/capabilities'))return reply({analytics:true,publication:true})
      if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-csrf'})
      if(url.includes('/projects?page='))return reply({list:[current]})
      if(url.endsWith('/projects/draft')&&options?.method==='PATCH'){
        writes++
        if(failSave)return Promise.resolve({ok:false,json:async()=>({code:409,message:'草稿已变化，请重新核对'})} as Response)
        const body=JSON.parse(String(options.body));current={...current,...body,revision:current.revision+1};return reply(current)
      }
      throw new Error('Unexpected request '+url)
    }))
    render(<SurveyApp/>);fireEvent.click(await screen.findByRole('button',{name:'查看/编辑'}))
    vi.useFakeTimers()
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存修改'}))})
    expect(screen.getByText('研究草稿已保存')).toBeVisible()
    act(()=>vi.advanceTimersByTime(4000))
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存修改'}))})
    act(()=>vi.advanceTimersByTime(1000))
    expect(screen.getByText('研究草稿已保存')).toBeVisible()
    act(()=>vi.advanceTimersByTime(3999))
    expect(screen.getByText('研究草稿已保存')).toBeVisible()
    act(()=>vi.advanceTimersByTime(1))
    expect(screen.queryByText('研究草稿已保存')).not.toBeInTheDocument();expect(writes).toBe(2)
    failSave=true
    await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'保存修改'}))})
    act(()=>vi.advanceTimersByTime(6000))
    expect(screen.getByRole('alert')).toHaveTextContent('草稿已变化，请重新核对');expect(writes).toBe(3)
  })

  it('shows the workspace title and actual creation timestamp without offering expansion for a short introduction',()=>{
    renderCards({...projects[0],createdAt:'2026-10-22T01:23:00.000Z'} as SurveyProject)
    expect(screen.getByRole('heading',{name:'研究工作台',level:1})).toBeVisible()
    const card=screen.getByRole('article',{name:projects[0].title})
    expect(card.querySelector('time')).toHaveAttribute('datetime','2026-10-22T01:23:00.000Z')
    expect(card.querySelector('time')).toHaveTextContent('2026')
    expect(within(card).queryByRole('button',{name:'更多介绍'})).not.toBeInTheDocument()
  })

  it.each([undefined,'not-a-date'])('does not invent creation dates when the timestamp is %s',createdAt=>{
    renderCards({...projects[0],createdAt} as SurveyProject)
    expect(screen.getByText('建立时间暂不可用')).toBeVisible()
    expect(document.querySelector('time')).not.toBeInTheDocument()
  })

  it('expands and collapses overflow without entering the editor, and keeps archiving separate from entry',()=>{
    vi.spyOn(HTMLElement.prototype,'scrollHeight','get').mockReturnValue(140)
    vi.spyOn(HTMLElement.prototype,'clientHeight','get').mockReturnValue(40)
    const description='这是一段完整研究介绍，说明研究目的与参与方式。'.repeat(8)
    const project={...projects[0],description} as SurveyProject
    const {onChoose,onArchive}=renderCards(project)
    const expand=screen.getByRole('button',{name:'更多介绍'})
    const text=document.getElementById(expand.getAttribute('aria-controls')!)!
    expect(expand).toHaveAttribute('aria-expanded','false')
    fireEvent.click(expand)
    expect(screen.getByRole('button',{name:'收起介绍'})).toHaveAttribute('aria-expanded','true')
    expect(text).toHaveClass('is-expanded');expect(text.textContent).toBe(description)
    fireEvent.click(screen.getByRole('button',{name:'收起介绍'}))
    expect(text).not.toHaveClass('is-expanded')
    expect(onChoose).not.toHaveBeenCalled();expect(onArchive).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'归档草稿'}))
    expect(onArchive).toHaveBeenCalledExactlyOnceWith(project);expect(onChoose).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button',{name:'查看/编辑'}))
    expect(onChoose).toHaveBeenCalledExactlyOnceWith(project)
  })

  it('keeps entry and archive disabled while a write is busy',()=>{
    const {onChoose,onArchive}=renderCards(projects[0] as SurveyProject,true)
    fireEvent.click(screen.getByRole('button',{name:'查看/编辑'}))
    fireEvent.click(screen.getByRole('button',{name:'归档草稿'}))
    expect(screen.getByRole('button',{name:'查看/编辑'})).toBeDisabled()
    expect(onChoose).not.toHaveBeenCalled();expect(onArchive).not.toHaveBeenCalled()
  })

  it('loads the independent toolkit once and switches header destinations without losing study filters and unsaved editor content',async()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    const navigation=screen.getByRole('navigation',{name:'研究工作台导航'})
    expect(within(navigation).getAllByRole('link').map(link=>link.textContent)).toEqual(['我的研究','工具集','素材库'])
    expect(within(navigation).getByRole('link',{name:'我的研究'})).toHaveAttribute('aria-current','page')
    fireEvent.click(screen.getByRole('button',{name:'研究检索'}))
    fireEvent.change(screen.getByRole('searchbox',{name:'检索研究'}),{target:{value:'学习'}})
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'长期跟踪研究'})).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button',{name:'查看/编辑'}))
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'未保存的名称'}})
    fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    const requests=vi.mocked(fetch).mock.calls.length
    fireEvent.click(within(navigation).getByRole('link',{name:'工具集'}))
    expect(await screen.findByRole('heading',{name:'工具集'})).toBeVisible()
    expect(window.location.pathname).toBe('/workspace/tools')
    expect(within(navigation).getByRole('link',{name:'工具集'})).toHaveAttribute('aria-current','page')
    fireEvent.click(within(navigation).getByRole('link',{name:'素材库'}))
    expect(await screen.findByRole('heading',{name:'素材库'})).toBeVisible()
    expect(window.location.pathname).toBe('/workspace/media')
    window.history.replaceState(null,'','/workspace/tools')
    fireEvent.popState(window)
    expect(await screen.findByRole('heading',{name:'工具集'})).toBeVisible()
    fireEvent.click(within(navigation).getByRole('link',{name:'我的研究'}))
    await waitFor(()=>expect(screen.getByRole('heading',{name:'研究工作台'})).toHaveFocus())
    expect(screen.getByRole('searchbox',{name:'检索研究'})).toHaveValue('学习')
    fireEvent.click(screen.getByRole('button',{name:'查看/编辑'}))
    expect(screen.getByRole('tab',{name:'发布与采集'})).toHaveAttribute('aria-selected','true')
    expect(screen.getByLabelText('研究名称')).toHaveValue('未保存的名称')
    expect(vi.mocked(fetch).mock.calls).toHaveLength(requests+2)
    expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).includes('/tool-library?'))).toHaveLength(1)
    expect(confirm).not.toHaveBeenCalled()
  })

  it.each([['tools','工具集'],['media','素材库'],['datasets','素材库']])('opens the authenticated %s page directly',async(area,label)=>{
    window.history.replaceState(null,'','/workspace/'+area)
    render(<SurveyApp/>)
    expect(await screen.findByRole('heading',{name:label})).toBeVisible()
    if(area==='tools')expect(screen.getByRole('button',{name:'编制工具'})).toBeVisible()
    else expect(screen.getByRole('group',{name:'素材类型'})).toBeVisible()
    expect(screen.queryByRole('button',{name:'新建研究'})).not.toBeInTheDocument()
    expect(within(screen.getByRole('navigation',{name:'研究工作台导航'})).getByRole('link',{name:label})).toHaveAttribute('aria-current','page')
  })

  it.each(['tools','media','datasets'])('keeps direct %s access behind researcher authentication',async area=>{
    window.history.replaceState(null,'','/workspace/'+area)
    vi.stubGlobal('fetch',vi.fn(()=>reply(null,false)))
    render(<SurveyApp/>)
    expect(await screen.findByRole('heading',{name:'研究者登录'})).toBeVisible()
    expect(screen.queryByRole('navigation',{name:'研究工作台导航'})).not.toBeInTheDocument()
    expect(screen.queryByText('内容即将加入')).not.toBeInTheDocument()
  })

  it('shows creation only after the create action and protects unsaved details before returning to the list',async()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    expect(screen.queryByLabelText('研究名称')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'研究检索'}))
    fireEvent.change(screen.getByRole('searchbox',{name:'检索研究'}),{target:{value:'学习'}})
    await waitFor(()=>expect(screen.getByRole('button',{name:'新建研究'})).toBeEnabled())
    fireEvent.click(screen.getByRole('button',{name:'新建研究'}))
    expect(screen.getByRole('dialog',{name:'创建研究项目'})).toBeVisible()
    expect(screen.getByLabelText('研究名称')).toHaveFocus()
    expect(screen.getByRole('radio',{name:/单次独立匿名/})).toBeChecked()
    fireEvent.click(screen.getByRole('radio',{name:/多波次关联采集/}))
    expect(screen.getByRole('radio',{name:/多波次关联采集/})).toBeChecked()
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'未提交的研究'}})
    fireEvent.click(screen.getByRole('button',{name:'取消'}))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('研究名称')).toHaveValue('未提交的研究')
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button',{name:'取消'}))
    await waitFor(()=>expect(screen.getByRole('heading',{name:'研究工作台'})).toHaveFocus())
    expect(screen.queryByLabelText('研究名称')).not.toBeInTheDocument()
    expect(screen.getByRole('heading',{name:'学习体验研究'})).toBeVisible()
    expect(screen.queryByRole('heading',{name:'长期跟踪研究'})).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([,options])=>options?.method&&options.method!=='GET')).toBe(false)
  })

  it('opens account settings from the header and returns to an unchanged research draft without requests',async()=>{
    render(<SurveyApp/>)
    fireEvent.click((await screen.findAllByRole('button',{name:'查看/编辑'}))[0])
    await waitFor(()=>expect(document.getElementById('survey-current-project-heading')).toHaveFocus())
    expect(screen.queryByRole('heading',{name:'研究工作台'})).not.toBeInTheDocument()
    expect(document.getElementById('survey-current-project-heading')?.tagName).toBe('H1')
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'尚未保存的项目名称'}})
    const fetcher=vi.mocked(fetch),before=fetcher.mock.calls.length
    const trigger=screen.getByRole('button',{name:'研究者，个人账号设置'})
    expect(trigger.closest('header')).toBeInTheDocument()
    trigger.focus();fireEvent.click(trigger)
    const dialog=screen.getByRole('dialog',{name:'个人信息与安全'})
    expect(within(dialog).getByText('研究者登录名')).toBeVisible()
    expect(within(dialog).getByLabelText('验证器动态验证码（6 位）')).toBeRequired()
    expect(within(dialog).getByRole('button',{name:'确认修改密码'})).toBeDisabled()
    fireEvent.keyDown(dialog,{key:'Escape'})
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
    expect(screen.getByLabelText('研究名称')).toHaveValue('尚未保存的项目名称')
    expect(fetcher.mock.calls).toHaveLength(before)
  })

  it('keeps failed password verification in the account dialog and preserves the research session',async()=>{
    const existing=vi.mocked(fetch).getMockImplementation()!
    vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>{
      if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-csrf'})
      if(url.endsWith('/auth/change-password'))return Promise.resolve({ok:false,json:async()=>({code:400,message:'动态验证码无效'})} as Response)
      return existing(url,options)
    }))
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    fireEvent.click(screen.getByRole('button',{name:'研究者，个人账号设置'}))
    const dialog=screen.getByRole('dialog',{name:'个人信息与安全'})
    fireEvent.change(within(dialog).getByLabelText('当前密码'),{target:{value:'SyntheticOld123'}})
    fireEvent.change(within(dialog).getByLabelText('新密码'),{target:{value:'SyntheticNew123'}})
    fireEvent.change(within(dialog).getByLabelText('验证器动态验证码（6 位）'),{target:{value:'123456'}})
    fireEvent.click(within(dialog).getByRole('button',{name:'确认修改密码'}))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('动态验证码无效')
    const request=vi.mocked(fetch).mock.calls.find(([url])=>String(url).endsWith('/auth/change-password'))
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({oldPassword:'SyntheticOld123',newPassword:'SyntheticNew123',code:'123456'})
    expect(screen.getByRole('heading',{name:'研究工作台'})).toBeInTheDocument()
    expect(screen.queryByRole('heading',{name:'研究者登录'})).not.toBeInTheDocument()
  })

  it.each(['network','server','malformed'])(
    'reuses the creation identity after a committed request with an uncertain %s response',async failure=>{
      const stored=new Map<string,Record<string,unknown>>(),requests:Record<string,unknown>[]=[]
      vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>{
        if(url.endsWith('/auth/me'))return reply({id:'r',username:'研究者',mustChangePassword:false})
        if(url.endsWith('/auth/capabilities'))return reply({analytics:true,publication:true})
        if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-csrf'})
        if(url.includes('/projects?page='))return reply({list:[...stored.values()]})
        if(url.endsWith('/projects')&&options?.method==='POST'){
          const body=JSON.parse(String(options.body)) as Record<string,unknown>;requests.push(body)
          const id=String(body.requestId)
          if(!stored.has(id))stored.set(id,{...body,id,revision:1,status:'DRAFT'})
          if(requests.length===1){
            if(failure==='network')return Promise.reject(new TypeError('Failed to fetch'))
            if(failure==='server')return reply(null,false)
            return Promise.resolve({ok:true,json:async()=>{throw new SyntaxError('Unconfirmed response')}} as unknown as Response)
          }
          return reply(stored.get(id))
        }
        throw new Error('Unexpected request '+url)
      }))
      render(<SurveyApp/>)
      await screen.findByRole('heading',{name:'研究工作台'})
      fireEvent.click(screen.getByRole('button',{name:'新建研究'}))
      fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'回执待核对的研究'}})
      fireEvent.click(screen.getByRole('button',{name:'创建研究'}))
      await screen.findByRole('alert')
      expect(stored.size).toBe(1)
      expect(screen.getByLabelText('研究名称')).toHaveValue('回执待核对的研究')
      fireEvent.click(screen.getByRole('button',{name:'创建研究'}))
      await screen.findByText('研究草稿已创建')
      expect(requests).toHaveLength(2)
      expect(requests[1]).toEqual(requests[0])
      expect(stored.size).toBe(1)
      expect(screen.getByRole('heading',{name:'编辑研究草稿'})).toBeVisible()
    })
  it('focuses the selected study context and preserves its active section when reopening from the directory',async()=>{
    render(<SurveyApp/>)
    fireEvent.click((await screen.findAllByRole('button',{name:'查看/编辑'}))[0])
    await waitFor(()=>expect(document.getElementById('survey-current-project-heading')).toHaveFocus())
    fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    fireEvent.click(screen.getByRole('button',{name:'← 返回研究列表（保留编辑）'}))
    await waitFor(()=>expect(screen.getByRole('heading',{name:'研究工作台'})).toHaveFocus())
    fireEvent.click(screen.getAllByRole('button',{name:'查看/编辑'})[0])
    await waitFor(()=>expect(document.getElementById('survey-current-project-heading')).toHaveFocus())
    expect(screen.getByRole('tab',{name:'发布与采集'})).toHaveAttribute('aria-selected','true')
    expect(document.getElementById('survey-current-project-heading')).toHaveTextContent('学习体验研究')
  })
  it('retains confirmed creation, revision and archive state when only list refresh fails',async()=>{
    let failList=false
    let current={...projects[0],id:'created',title:'新研究',revision:1}
    const writes:{path:string;body:Record<string,unknown>}[]=[]
    vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>{
      if(url.endsWith('/auth/me'))return reply({id:'r',username:'研究者',mustChangePassword:false})
      if(url.endsWith('/auth/capabilities'))return reply({analytics:true,publication:true})
      if(url.endsWith('/auth/csrf'))return reply({csrfToken:'synthetic-csrf'})
      if(url.includes('/projects?page='))return failList?reply(null,false):reply({list:[current]})
      const body=JSON.parse(String(options?.body)) as Record<string,unknown>
      writes.push({path:url,body});failList=true
      if(url.endsWith('/projects'))return reply(current)
      if(url.endsWith('/archive')){current={...current,status:'ARCHIVED',revision:current.revision+1};return reply(current)}
      if(url.endsWith('/projects/created')){current={...current,title:String(body.title),revision:current.revision+1};return reply(current)}
      throw new Error('Unexpected request '+url)
    }))
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    fireEvent.click(screen.getByRole('button',{name:'新建研究'}))
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:current.title}})
    fireEvent.click(screen.getByRole('button',{name:'创建研究'}))
    expect(await screen.findByText('研究草稿已创建')).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('研究列表未能更新')
    expect(screen.getByRole('heading',{name:'编辑研究草稿'})).toBeVisible()
    expect(screen.queryByRole('button',{name:'创建研究'})).not.toBeInTheDocument()
    expect(writes.filter(write=>write.path.endsWith('/projects'))).toHaveLength(1)
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'已保存的新名称'}})
    fireEvent.click(screen.getByRole('button',{name:'保存修改'}))
    expect(await screen.findByText('研究草稿已保存')).toBeVisible()
    expect(writes[writes.length-1]?.body).toMatchObject({revision:1,title:'已保存的新名称'})
    fireEvent.click(screen.getByRole('button',{name:'← 返回研究列表（保留编辑）'}))
    expect(screen.getByRole('heading',{name:'已保存的新名称',level:3})).toBeVisible()
    fireEvent.click(screen.getByRole('button',{name:'归档草稿'}))
    expect(await screen.findByText('研究已归档')).toBeVisible()
    expect(writes[writes.length-1]).toMatchObject({path:'/api/survey/projects/created/archive',body:{revision:2}})
    expect(screen.getByRole('button',{name:'恢复草稿'})).toBeEnabled()
    expect(document.querySelector('#survey-workspace-settings button')).toBeDisabled()
    failList=false;fireEvent.click(screen.getByRole('button',{name:'重试研究列表'}))
    await waitFor(()=>expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(writes).toHaveLength(3)
  })

  it('preserves the verified session on project failure and retries only the list',async()=>{
    let failed=true
    const fetcher=vi.fn((url:string,options?:RequestInit)=>{
      if(options?.method&&options.method!=='GET')throw new Error('Directory retry must not write')
      if(url.endsWith('/auth/me'))return reply({id:'r',username:'研究者',mustChangePassword:false})
      if(url.endsWith('/auth/capabilities'))return reply({analytics:true,publication:true})
      if(url.includes('/projects?page='))return failed?reply(null,false):reply({list:projects})
      throw new Error('Unexpected request '+url)
    })
    vi.stubGlobal('fetch',fetcher)
    render(<SurveyApp/>)
    expect(await screen.findByRole('heading',{name:'研究工作台'})).toBeVisible()
    expect(screen.getByRole('alert')).toHaveTextContent('当前会话及已显示的研究会保留')
    expect(screen.queryByRole('heading',{name:'研究者登录'})).not.toBeInTheDocument()
    expect(screen.queryByText('从一项研究草稿开始')).not.toBeInTheDocument()
    failed=false;fireEvent.click(screen.getByRole('button',{name:'重试研究列表'}))
    expect(await screen.findByRole('heading',{name:'学习体验研究'})).toBeVisible()
    expect(fetcher.mock.calls.filter(([url])=>url.endsWith('/auth/me'))).toHaveLength(1)
    expect(fetcher.mock.calls.some(([,options])=>options?.method&&options.method!=='GET')).toBe(false)
  })

  it('keeps global filters and edits when returning to the directory',async()=>{
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    const searchToggle=screen.getByRole('button',{name:'研究检索'})
    expect(searchToggle).toHaveAttribute('aria-expanded','false')
    expect(screen.queryByRole('searchbox',{name:'检索研究'})).not.toBeInTheDocument()
    fireEvent.click(searchToggle)
    expect(screen.getByRole('searchbox',{name:'检索研究'})).toHaveFocus()
    fireEvent.change(screen.getByRole('searchbox',{name:'检索研究'}),{target:{value:'学习'}})
    fireEvent.click(searchToggle)
    expect(screen.queryByRole('searchbox',{name:'检索研究'})).not.toBeInTheDocument()
    expect(searchToggle).toHaveAttribute('data-filtered','true')
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'长期跟踪研究'})).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button',{name:'查看/编辑'}))
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'尚未保存的研究'}})
    fireEvent.click(screen.getByRole('button',{name:'← 返回研究列表（保留编辑）'}))
    await waitFor(()=>expect(screen.getByRole('heading',{name:'研究工作台'})).toHaveFocus())
    fireEvent.click(searchToggle)
    expect(screen.getByRole('searchbox',{name:'检索研究'})).toHaveValue('学习')
    expect(screen.getByLabelText('研究名称')).toHaveValue('尚未保存的研究')
    fireEvent.click(screen.getByRole('button',{name:'查看/编辑'}))
    expect(screen.getByRole('tab',{name:'研究设置'})).toHaveAttribute('aria-selected','true')
  })

  it('distinguishes a filtered empty page and protects edits before creating another project',async()=>{
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(false)
    render(<SurveyApp/>)
    await screen.findByRole('heading',{name:'研究工作台'})
    fireEvent.click(screen.getByRole('button',{name:'研究检索'}))
    fireEvent.click(within(screen.getByRole('group',{name:'按研究状态筛选'})).getByRole('button',{name:'已结束'}))
    expect(await screen.findByRole('heading',{name:'没有符合条件的研究'})).toBeVisible()
    fireEvent.click(screen.getByRole('button',{name:'显示全部研究'}))
    fireEvent.click((await screen.findAllByRole('button',{name:'查看/编辑'}))[0])
    fireEvent.change(screen.getByLabelText('研究名称'),{target:{value:'不能丢失'}})
    fireEvent.click(screen.getByRole('button',{name:'新建其他项目'}))
    expect(confirm).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('研究名称')).toHaveValue('不能丢失')
    confirm.mockReturnValue(true)
    fireEvent.click(screen.getByRole('button',{name:'新建其他项目'}))
    expect(screen.getByRole('dialog',{name:'创建研究项目'})).toBeVisible()
    expect(screen.getByLabelText('研究名称')).toHaveValue('')
  })
  it('keeps state buttons visible with search collapsed, changes page size and sort, and resets each new query to page one',async()=>{
    const base=vi.mocked(fetch).getMockImplementation()!
    vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>{
      if(url.includes('/projects?page=')){
        const p=new URL(url,'http://local.test').searchParams,page=Number(p.get('page')),size=Number(p.get('pageSize')||25)
        return reply({page,total:80,hasNext:page*size<80,list:[{...projects[0],id:'page-'+page,title:'第'+page+'页研究'}]})
      }
      return base(url,options)
    }))
    render(<SurveyApp/>);await screen.findByRole('heading',{name:'第1页研究'})
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    const states=screen.getByRole('group',{name:'按研究状态筛选'})
    expect(within(states).getAllByRole('button').map(b=>b.textContent)).toEqual(['全部','草稿','进行中','已暂停','已结束','已归档'])
    fireEvent.click(screen.getByRole('button',{name:'下一页'}));await screen.findByRole('heading',{name:'第2页研究'})
    fireEvent.change(screen.getByLabelText('每页显示'),{target:{value:'10'}})
    await screen.findByRole('heading',{name:'第1页研究'})
    expect(vi.mocked(fetch).mock.calls.slice(-1)[0]?.[0]).toBe('/api/survey/projects?page=1&pageSize=10')
    fireEvent.change(screen.getByLabelText('创建时间排序'),{target:{value:'created_asc'}})
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.slice(-1)[0]?.[0]).toBe('/api/survey/projects?page=1&pageSize=10&sort=created_asc'))
    fireEvent.click(within(states).getByRole('button',{name:'草稿'}))
    await waitFor(()=>expect(vi.mocked(fetch).mock.calls.slice(-1)[0]?.[0]).toBe('/api/survey/projects?page=1&pageSize=10&sort=created_asc&status=DRAFT'))
    expect(screen.getByText('共 80 项研究 · 显示 1–1 项')).toBeVisible()
    expect(within(states).getByRole('button',{name:'草稿'})).toHaveAttribute('aria-pressed','true')
    expect(vi.mocked(fetch).mock.calls.filter(([url])=>String(url).endsWith('/auth/me'))).toHaveLength(1)
  })

  it.each([false,true])('ignores an older filter response or error after a newer successful selection (failure=%s)',async failure=>{
    const base=vi.mocked(fetch).getMockImplementation()!
    let resolveOld!:(value:Response)=>void
    const old=new Promise<Response>(resolve=>{resolveOld=resolve})
    vi.stubGlobal('fetch',vi.fn((url:string,options?:RequestInit)=>{
      if(url.includes('status=DRAFT'))return old
      if(url.includes('status=ACTIVE'))return reply({list:[projects[1]],page:1,total:1,hasNext:false})
      return base(url,options)
    }))
    render(<SurveyApp/>);await screen.findByRole('heading',{name:'研究工作台'})
    const states=screen.getByRole('group',{name:'按研究状态筛选'})
    fireEvent.click(within(states).getByRole('button',{name:'草稿'}))
    fireEvent.click(within(states).getByRole('button',{name:'进行中'}))
    await waitFor(()=>expect(screen.queryByRole('heading',{name:'学习体验研究'})).not.toBeInTheDocument())
    await act(async()=>{resolveOld(await reply({list:[projects[0]]},!failure))})
    expect(screen.getByRole('heading',{name:'长期跟踪研究'})).toBeVisible()
    expect(screen.queryByRole('heading',{name:'学习体验研究'})).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByText('正在读取研究列表，请稍候…')).not.toBeInTheDocument()
  })

})
