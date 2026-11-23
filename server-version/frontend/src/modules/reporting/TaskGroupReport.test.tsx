import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react'
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {TaskGroupReport,type TaskGroupArtifact} from './TaskGroupReport'
const artifact:TaskGroupArtifact={artifactId:'snapshot',generatedAt:'2026-11-23T00:00:00Z',projection:{title:'合成群体报告',sourceLabel:'合成课程',cutoff:'2026-11-23T00:00:00Z',populationLabel:'测试群体',completedN:5,assignedN:5,countUnit:'PERSON',tool:{key:'tool',title:'测试工具',kind:'SCALE'},metrics:[],limitations:['测试限制说明']}}
let fullscreen:Element|null=null
const enter=vi.fn(),exit=vi.fn()
beforeEach(()=>{
 fullscreen=null;enter.mockReset();exit.mockReset()
 Object.defineProperty(document,'fullscreenElement',{configurable:true,get:()=>fullscreen})
 Object.defineProperty(document.documentElement,'requestFullscreen',{configurable:true,value:enter.mockImplementation(async()=>{fullscreen=document.documentElement;document.dispatchEvent(new Event('fullscreenchange'))})})
 Object.defineProperty(document,'exitFullscreen',{configurable:true,value:exit.mockImplementation(async()=>{fullscreen=null;document.dispatchEvent(new Event('fullscreenchange'))})})
})
afterEach(()=>{cleanup();vi.restoreAllMocks();document.documentElement.classList.remove('task-group-report-presenting')})
it('keeps fullscreen presentation in document flow and cleans it on Escape',async()=>{
 render(<TaskGroupReport artifact={artifact}/>);fireEvent.click(screen.getByRole('button',{name:'全屏展示'}))
 await waitFor(()=>expect(document.documentElement).toHaveClass('task-group-report-presenting'))
 expect(enter).toHaveBeenCalledOnce();expect(fullscreen).toBe(document.documentElement)
 act(()=>{fullscreen=null;document.dispatchEvent(new Event('fullscreenchange'))})
 expect(document.documentElement).not.toHaveClass('task-group-report-presenting')
})
it('awaits fullscreen exit before invoking native print and retains the snapshot footer',async()=>{
 const print=vi.spyOn(window,'print').mockImplementation(()=>{expect(fullscreen).toBeNull()})
 render(<TaskGroupReport artifact={artifact}/>);fireEvent.click(screen.getByRole('button',{name:'全屏展示'}))
 await waitFor(()=>expect(document.documentElement).toHaveClass('task-group-report-presenting'))
 fireEvent.click(screen.getByRole('button',{name:'打印 / 保存 PDF'}))
 await waitFor(()=>expect(print).toHaveBeenCalledOnce());expect(exit).toHaveBeenCalledOnce()
 expect(document.querySelector('.task-group-report footer')).toHaveTextContent('快照 snapshot');expect(screen.getByText('测试限制说明')).toBeVisible()
})
