import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import SurveyApp from './SurveyApp'
vi.mock('./SurveyToolLibrary',()=>({SurveyToolLibrary:()=> <h2>工具集已就绪</h2>}))
vi.mock('./SurveyMaterialLibrary',()=>({SurveyMaterialLibrary:()=> <h2>素材库已就绪</h2>}))
const reply=(data:unknown)=>({ok:true,json:async()=>({code:0,message:'成功',data})})
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();window.history.replaceState(null,'','/')})
it.each([['tools','工具集已就绪'],['media','素材库已就绪']])('opens %s without requesting unrelated project directory',async(area,heading)=>{
 window.history.replaceState(null,'','/workspace/'+area)
 const fetcher=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'r',username:'研究者',mustChangePassword:false})
  if(url.includes('/projects?'))return new Promise(()=>{})
  return reply({analytics:false,publication:false})
 });vi.stubGlobal('fetch',fetcher)
 render(<SurveyApp/>);await screen.findByRole('heading',{name:heading})
 expect(fetcher.mock.calls.some(([url])=>url.includes('/projects?'))).toBe(false)
 fireEvent.click(screen.getByRole('link',{name:'我的研究'}))
 await waitFor(()=>expect(fetcher.mock.calls.filter(([url])=>url.includes('/projects?'))).toHaveLength(1))
 expect(screen.getByRole('heading',{name:'研究工作台'})).toBeInTheDocument()
})
it('opens a direct project without waiting for the unrelated directory',async()=>{
 window.history.replaceState(null,'','/workspace?project=project-one&section=settings')
 const fetcher=vi.fn(async(url:string)=>{
  if(url.endsWith('/auth/me'))return reply({id:'r',username:'研究者',mustChangePassword:false})
  if(url.endsWith('/projects/project-one'))return reply({id:'project-one',title:'目标研究',description:'',collectionMode:'SINGLE_UNLINKED',status:'DRAFT',revision:1})
  if(url.includes('/projects?'))return new Promise(()=>{})
  return reply({list:[],analytics:false,publication:false})
 });vi.stubGlobal('fetch',fetcher)
 render(<SurveyApp/>);await screen.findByDisplayValue('目标研究')
 expect(fetcher.mock.calls.some(([url])=>url.includes('/projects?'))).toBe(false)
})
