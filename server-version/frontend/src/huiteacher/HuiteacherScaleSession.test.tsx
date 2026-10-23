import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,expect,it,vi} from 'vitest'
import {HuiteacherMyScaleTasks} from './HuiteacherMyScaleTasks'
import type {CompositeAttemptState} from '../modules/composite/types'
const captured=vi.hoisted(()=>({latest:null as null|{state:CompositeAttemptState;onExit:()=>void;onCompleted:()=>void;onReload:()=>Promise<void>}}))
vi.mock('../components/FinalCompositeAssessment',()=>({default:(props:NonNullable<typeof captured.latest>)=>{captured.latest=props;return <div><span>运行记录：{props.state.id}</span><button onClick={props.onExit}>模拟已完成保存退出</button></div>}}))
type Api=Parameters<typeof HuiteacherMyScaleTasks>[0]['api']
const tasks=['A','B'].map(id=>({executionId:id,eventId:'event',eventTitle:'活动',runId:'run',organizationId:'org',status:'STARTED',runtimeBindingRef:id,resourceKey:'teacher-scale:'+id+':INDIVIDUAL',title:'任务'+id,runStatus:'PUBLISHED'}))
const state=(id:string):CompositeAttemptState=>({id,assessmentId:'assessment-'+id,name:id,instruction:null,status:'IN_PROGRESS',progress:0,completedItems:0,totalItems:1,currentIndex:0,startedAt:'2026-10-23T00:00:00Z',lastSavedAt:'2026-10-23T00:00:00Z',completedAt:null,anonymousCode:null,items:[],currentItem:null})
function deferred(){let resolve!:(v:CompositeAttemptState)=>void;let reject!:(e:Error)=>void;const promise=new Promise<CompositeAttemptState>((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}}
function client(read:(id:string)=>Promise<CompositeAttemptState>){return vi.fn((path:string)=>path==='/my-scale-tasks'?Promise.resolve({list:tasks}):read(path.split('/').pop()!)) as unknown as Api}
const open=(i:number)=>fireEvent.click(screen.getAllByRole('button',{name:'进入本人自评'})[i])
afterEach(()=>{cleanup();captured.latest=null})
it('keeps A intact and refuses an unsaved direct switch, then atomically opens B after explicit saved exit',async()=>{
 const api=client(async id=>state(id));render(<HuiteacherMyScaleTasks api={api}/>);await screen.findByText('任务A');open(0)
 await screen.findByText('运行记录：A');expect(screen.getByRole('heading',{name:'正在完成：任务A'})).toBeInTheDocument()
 expect(screen.getAllByRole('button',{name:'进入本人自评'})[1]).toBeDisabled();open(1)
 expect(api).not.toHaveBeenCalledWith('/composite-attempts/B');expect(screen.getByText('运行记录：A')).toBeInTheDocument()
 fireEvent.click(screen.getByRole('button',{name:'模拟已完成保存退出'}));open(1)
 await screen.findByText('运行记录：B');expect(screen.getByRole('heading',{name:'正在完成：任务B'})).toBeInTheDocument()
})
it('failed B read never publishes B heading or resurrects A after explicit saved exit',async()=>{
 const api=client(async id=>{if(id==='B')throw Error('B读取失败');return state(id)});render(<HuiteacherMyScaleTasks api={api}/>);await screen.findByText('任务A');open(0)
 await screen.findByText('运行记录：A');fireEvent.click(screen.getByRole('button',{name:'模拟已完成保存退出'}));open(1)
 await screen.findByText('B读取失败');expect(screen.queryByRole('heading',{name:/正在完成/})).not.toBeInTheDocument();expect(screen.queryByText('运行记录：A')).not.toBeInTheDocument()
})
it('cancelled late A response cannot replace newer successful B',async()=>{
 const a=deferred(),api=client(id=>id==='A'?a.promise:Promise.resolve(state(id)));render(<HuiteacherMyScaleTasks api={api}/>);await screen.findByText('任务A');open(0)
 fireEvent.click(await screen.findByRole('button',{name:'取消打开测评'}));open(1);await screen.findByText('运行记录：B')
 await act(async()=>a.resolve(state('A')));expect(screen.getByText('运行记录：B')).toBeInTheDocument();expect(screen.queryByText('运行记录：A')).not.toBeInTheDocument()
})
it('API change and old runner completion/reload cannot close or overwrite the new session',async()=>{
 const oldApi=client(async id=>state(id)),newApi=client(async id=>state(id));const view=render(<HuiteacherMyScaleTasks api={oldApi}/>);await screen.findByText('任务A');open(0);await screen.findByText('运行记录：A');const old=captured.latest!
 view.rerender(<HuiteacherMyScaleTasks api={newApi}/>);await waitFor(()=>expect(screen.queryByText('运行记录：A')).not.toBeInTheDocument());await screen.findByText('任务B');open(1);await screen.findByText('运行记录：B')
 await act(async()=>{old.onCompleted();await old.onReload();old.onExit()});expect(screen.getByText('运行记录：B')).toBeInTheDocument()
})

it('already completed open and completed reload never leave an invisible session blocking task entry',async()=>{
 let aCompleted=true
 const api=client(async id=>({...state(id),status:id==='A'&&aCompleted?'COMPLETED':'IN_PROGRESS'}));render(<HuiteacherMyScaleTasks api={api}/>);await screen.findByText('任务A');open(0)
 await waitFor(()=>expect(screen.getAllByRole('button',{name:'进入本人自评'})[1]).toBeEnabled());expect(screen.queryByRole('heading',{name:/正在完成/})).not.toBeInTheDocument()
 aCompleted=false;open(0);await screen.findByText('运行记录：A');aCompleted=true
 await act(async()=>captured.latest!.onReload())
 await waitFor(()=>expect(screen.getAllByRole('button',{name:'进入本人自评'})[1]).toBeEnabled());expect(screen.queryByText('运行记录：A')).not.toBeInTheDocument()
})
