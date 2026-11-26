import {act,cleanup,render,screen} from '@testing-library/react'
import {MemoryRouter,Route,Routes} from 'react-router-dom'
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({
  connected:true,listeners:{} as Record<string,(payload?:unknown)=>void>,
  present:null as null|((value:{enabled:boolean;displayMode:'QUESTION'|'DANMAKU'})=>void),
  get:vi.fn(),emit:vi.fn(),emitWithAck:vi.fn(),
  chart:{resize:vi.fn(),setOption:vi.fn(),dispose:vi.fn()},
}))
vi.mock('echarts/core',()=>({use:vi.fn(),init:vi.fn(()=>mocks.chart),graphic:{LinearGradient:class {}}}))
vi.mock('echarts/charts',()=>({BarChart:{}}))
vi.mock('echarts/components',()=>({GridComponent:{},TitleComponent:{},TooltipComponent:{}}))
vi.mock('echarts/renderers',()=>({CanvasRenderer:{}}))
vi.mock('echarts-wordcloud',()=>({}))
vi.mock('../../api/client',()=>({default:{get:mocks.get}}))
vi.mock('../../contexts/AuthContext',()=>({useAuth:()=>({isLoading:false,user:{id:'teacher'}})}))
vi.mock('../../hooks/useClassroomSocket',()=>({
  useClassroomSocket:()=>({
    isConnected:mocks.connected,emit:mocks.emit,emitWithAck:mocks.emitWithAck,
    on:register,off:unregister,
  }),
}))
function register(event:string,listener:(payload?:unknown)=>void){mocks.listeners[event]=listener}
function unregister(event:string){delete mocks.listeners[event]}
vi.mock('./ClassroomDanmakuDisplay',async()=>{
  const {useEffect}=await import('react')
  return {ClassroomDanmakuDisplay:({onPresentationChange}:{onPresentationChange:NonNullable<typeof mocks.present>})=>{
    useEffect(()=>{
      mocks.present=onPresentationChange
      onPresentationChange({enabled:true,displayMode:'DANMAKU'})
    },[onPresentationChange])
    return <section aria-label="合成弹幕显示">合成弹幕消息</section>
  }}
})
import BigScreen from './BigScreen'
const tree=(entry='/bigscreen/class')=><MemoryRouter initialEntries={[entry]}><Routes>
  <Route path="/bigscreen/:classroomId" element={<BigScreen/>}/>
</Routes></MemoryRouter>
beforeEach(()=>{
  vi.clearAllMocks();mocks.connected=true;mocks.listeners={};mocks.present=null
  mocks.get.mockResolvedValue({code:0,data:{question:{id:'question',questionContent:{type:'single_choice',question:'历史题目',options:[]},questionIndex:1,timeLimit:60},stats:{questionId:'question',answerCount:1,totalSessions:1,submissionRate:100}}})
})
afterEach(()=>cleanup())
describe('BigScreen danmaku terminal lifecycle',()=>{
  it('unmounts the leaf on classroom close and stays closed after a delayed snapshot or socket disconnect',async()=>{
    const view=render(tree())
    await screen.findByRole('region',{name:'合成弹幕显示'})
    const delayed=mocks.present!
    act(()=>mocks.listeners['broadcast:question']({questionId:'question',questionIndex:1,timeLimit:60,questionContent:{type:'single_choice',question:'当前题目',options:[]}}))
    act(()=>mocks.listeners['broadcast:stats']({questionId:'question',answerCount:1,totalSessions:1,submissionRate:100}))
    act(()=>mocks.listeners['broadcast:closed']({classroomId:'class'}))
    expect(screen.getByText('本次课堂互动已结束')).toBeInTheDocument()
    expect(mocks.chart.dispose).toHaveBeenCalledOnce()
    expect(screen.queryByText('合成弹幕消息')).toBeNull()
    act(()=>delayed({enabled:true,displayMode:'DANMAKU'}))
    expect(screen.queryByText('合成弹幕消息')).toBeNull()
    mocks.connected=false;view.rerender(tree())
    expect(screen.getByText('本次课堂互动已结束')).toBeInTheDocument()
    expect(screen.queryByText('连接中...')).toBeNull()
  })
  it('restores the closed screen from the ENDED join snapshot after reload',async()=>{
    const original=render(tree())
    await screen.findByRole('region',{name:'合成弹幕显示'})
    act(()=>mocks.listeners['broadcast:closed']({classroomId:'class'}))
    original.unmount()
    mocks.listeners={};mocks.present=null
    render(tree())
    await screen.findByRole('region',{name:'合成弹幕显示'})
    const delayed=mocks.present!
    // A new page has no in-memory close event; only the server join snapshot.
    act(()=>mocks.listeners['bigscreen:joined']({status:'ENDED',currentQuestion:null,onlineCount:0}))
    expect(screen.getByText('本次课堂互动已结束')).toBeInTheDocument()
    expect(screen.queryByText('等待教师出题')).toBeNull()
    expect(screen.queryByText('等待出题')).toBeNull()
    expect(screen.queryByText('合成弹幕消息')).toBeNull()
    act(()=>delayed({enabled:true,displayMode:'DANMAKU'}))
    expect(screen.queryByText('合成弹幕消息')).toBeNull()
  })
  it('keeps historical question viewing independent from the live danmaku leaf',async()=>{
    mocks.connected=false
    render(tree('/bigscreen/class?history=question'))
    expect(await screen.findByText('第 1 题 - 历史统计')).toBeInTheDocument()
    expect(screen.queryByRole('region',{name:'合成弹幕显示'})).toBeNull()
    expect(mocks.get).toHaveBeenCalledWith('/classrooms/class/questions/question/stats')
    expect(mocks.emitWithAck).not.toHaveBeenCalled()
  })
})


describe('BigScreen question round isolation', () => {
  it('restores the round only from bigscreen:joined so matching stats and finish events still apply', async () => {
    render(tree())
    await screen.findByRole('region', { name: '合成弹幕显示' })
    act(() => mocks.present!({ enabled: false, displayMode: 'QUESTION' }))
    const startedAt = '2026-10-04T00:02:00.000Z'
    const previousStartedAt = '2026-10-04T00:00:00.000Z'
    // No broadcast:question is emitted: reconnect/reload must restore the marker
    // from the joined snapshot itself before any live round-bound events arrive.
    act(() => mocks.listeners['bigscreen:joined']({
      status: 'ACTIVE', onlineCount: 2, stats: null,
      currentQuestion: {
        questionId: 'question', questionIndex: 1, startedAt,
        remainingTime: 42, timeLimit: 60,
        questionContent: { type: 'single_choice', question: '加入快照恢复的题目', options: [] },
      },
    }))
    expect(screen.getByText('加入快照恢复的题目')).toBeInTheDocument()
    expect(screen.getByText('0:42')).toBeInTheDocument()
    act(() => mocks.listeners['broadcast:stats']({
      questionId: 'question', startedAt, answerCount: 2, totalSessions: 2, submissionRate: 100,
    }))
    expect(screen.getByText('2 人已答')).toBeInTheDocument()
    act(() => {
      mocks.listeners['broadcast:stats']({ questionId: 'question', startedAt: previousStartedAt, answerCount: 99, totalSessions: 99, submissionRate: 100 })
      mocks.listeners['broadcast:finished']({ questionId: 'question', startedAt: previousStartedAt })
    })
    expect(screen.getByText('2 人已答')).toBeInTheDocument()
    expect(screen.queryByText('99 人已答')).toBeNull()
    expect(screen.queryByText('答题已结束')).toBeNull()
    act(() => mocks.listeners['broadcast:finished']({ questionId: 'question', startedAt }))
    expect(screen.getByText('答题已结束')).toBeInTheDocument()
    expect(screen.queryByText('0:42')).toBeNull()
  })
  it('keeps the restarted round active when old finish/stats/next arrive', async () => {
    render(tree())
    await screen.findByRole('region', { name: '合成弹幕显示' })
    act(() => mocks.present!({ enabled: false, displayMode: 'QUESTION' }))
    const old = { questionId: 'question', questionIndex: 1, startedAt: '2026-10-04T00:00:00.000Z', remainingTime: 40, timeLimit: 60, questionContent: { type: 'single_choice', question: '当前题目', options: [] } }
    const next = { ...old, startedAt: '2026-10-04T00:02:00.000Z', remainingTime: 50 }
    act(() => mocks.listeners['broadcast:question'](old))
    act(() => mocks.listeners['broadcast:question'](next))
    act(() => mocks.listeners['broadcast:stats']({ questionId: 'question', startedAt: next.startedAt, answerCount: 1, totalSessions: 2, submissionRate: 50 }))
    act(() => {
      mocks.listeners['broadcast:finished']({ questionId: 'question', startedAt: old.startedAt })
      mocks.listeners['broadcast:stats']({ questionId: 'question', startedAt: old.startedAt, answerCount: 99, totalSessions: 99, submissionRate: 100 })
      mocks.listeners['broadcast:next']({ expectedQuestionId: 'question', expectedStartedAt: old.startedAt })
    })
    expect(screen.getByText('当前题目')).toBeInTheDocument()
    expect(screen.queryByText('答题已结束')).toBeNull()
    expect(screen.getByText('1 人已答')).toBeInTheDocument()
  })
})


it('keeps a queued old countdown tick out of the new round and rejects its replay after clear', async () => {
  vi.useFakeTimers()
  try {
    render(tree())
    act(() => mocks.present!({ enabled: false, displayMode: 'QUESTION' }))
    const old = { questionId: 'question', questionIndex: 1, startedAt: '2026-10-04T00:00:00Z', remainingTime: 1, timeLimit: 60, questionContent: { type: 'single_choice', question: '当前题目', options: [] } }
    const next = { ...old, startedAt: '2026-10-04T00:02:00Z', remainingTime: 5 }
    act(() => mocks.listeners['broadcast:question'](old))
    act(() => {
      mocks.listeners['broadcast:question'](next)
      vi.advanceTimersByTime(1000)
    })
    expect(screen.getByText('0:05')).toBeInTheDocument()
    act(() => mocks.listeners['broadcast:next']({ expectedQuestionId: 'question', expectedStartedAt: next.startedAt }))
    act(() => mocks.listeners['broadcast:question'](next))
    expect(screen.queryByText('当前题目')).toBeNull()
  } finally { vi.useRealTimers() }
})
