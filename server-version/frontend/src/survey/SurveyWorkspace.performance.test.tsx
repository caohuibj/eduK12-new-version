import {useEffect} from 'react'
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,describe,expect,it,vi} from 'vitest'
import SurveyApp from './SurveyApp'

const mounts=vi.hoisted(()=>[] as string[])
function Panel({projectId,name}:{projectId:string;name:string}){
  useEffect(()=>{mounts.push(projectId+':'+name)},[projectId,name])
  return <input aria-label={projectId+':'+name} defaultValue="未保存内容"/>
}
vi.mock('./SurveyWaveStudio',()=>({SurveyWaveStudio:({projectId}:{projectId:string})=><Panel projectId={projectId} name="publish"/>}))
vi.mock('./SurveyReportStudio',()=>({SurveyReportStudio:({projectId}:{projectId:string})=><Panel projectId={projectId} name="reports"/>}))
vi.mock('./SurveyAnalyticsWorkspace',()=>({SurveyAnalyticsWorkspace:({projectId}:{projectId:string})=><Panel projectId={projectId} name="data"/>}))
const projects=['p1','p2'].map(id=>({id,title:'合成研究 '+id,description:'合成',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1}))
function setup(path='/workspace'){
  mounts.length=0;window.history.replaceState(null,'',path)
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>{
    const data=url.endsWith('/auth/me')?{id:'synthetic',username:'researcher'}
      :url.endsWith('/auth/capabilities')?{analytics:true,publication:true}
      :url.includes('/projects?page=')?{list:projects}
      :projects.find(project=>url.endsWith('/projects/'+project.id))
    if(!data)throw new Error('Unexpected request '+url)
    return {ok:true,json:async()=>({code:0,data})} as Response
  }))
  render(<SurveyApp/>)
}
async function openProject(index=0){
  const buttons=await screen.findAllByRole('button',{name:'查看/编辑'})
  fireEvent.click(buttons[index])
  await screen.findByRole('tab',{name:'研究设置'})
}
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks()})
describe('Survey project panels load on first visit',()=>{
  it('keeps settings free of panel mounts, and retains unsaved visited editors across tabs',async()=>{
    setup();await openProject()
    expect(mounts).toEqual([])
    fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    fireEvent.change(await screen.findByLabelText('p1:publish'),{target:{value:'保留的草稿'}})
    fireEvent.click(screen.getByRole('tab',{name:'私有报告'}))
    await screen.findByLabelText('p1:reports')
    fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    expect(screen.getByLabelText('p1:publish')).toHaveValue('保留的草稿')
    fireEvent.click(screen.getByRole('tab',{name:'数据'}));await screen.findByLabelText('p1:data')
    expect(mounts).toEqual(['p1:publish','p1:reports','p1:data'])
  })
  it('does not mount another project using the previous project’s visits',async()=>{
    setup();await openProject();fireEvent.click(screen.getByRole('tab',{name:'发布与采集'}))
    await screen.findByLabelText('p1:publish')
    fireEvent.click(screen.getByRole('button',{name:'← 返回研究列表（保留编辑）'}));await openProject(1)
    expect(screen.queryByLabelText('p1:publish')).not.toBeInTheDocument()
    expect(mounts).toEqual(['p1:publish'])
    fireEvent.click(screen.getByRole('tab',{name:'私有报告'}));await screen.findByLabelText('p2:reports')
    expect(mounts).toEqual(['p1:publish','p2:reports'])
  })
  it.each(['publish','reports','data'])('opens a direct %s link without mounting other panels',async section=>{
    setup('/workspace?project=p1&section='+section)
    await screen.findByLabelText('p1:'+section)
    await waitFor(()=>expect(mounts).toEqual(['p1:'+section]))
  })
})
