import {fireEvent,render,screen} from '@testing-library/react'
import {MemoryRouter} from 'react-router-dom'
import {expect,it,vi} from 'vitest'
const m=vi.hoisted(()=>({sources:vi.fn(),analyze:vi.fn()}))
vi.mock('../api/trainingAnalysis',()=>({trainingAnalysisApi:m}))
vi.mock('../api/client',()=>({sessionFetch:vi.fn()}))
vi.mock('./TrainingReferenceStudio',()=>({TrainingReferenceStudio:({actorId,courseId,onRiskChange}:any)=><section aria-label="参考构建入口"><span>{actorId}:{courseId}</span><button onClick={()=>onRiskChange(true)}>模拟参考修改未保存</button><button onClick={()=>onRiskChange(false)}>模拟参考修改已确认</button></section>}))
vi.mock('./FormalReferenceStudio',()=>({default:({actorId}:any)=><section aria-label="正式参考入口">{actorId}</section>,FormalReferenceSubmission:()=>null}))
import TrainingCourseAnalysis from './TrainingCourseAnalysis'
it('retains both reference entry points and main scientific locks around the guided selectors',async()=>{
 m.sources.mockResolvedValue({list:[{taskId:'task',taskName:'合成测评',publication:'2026-10-01T00:00:00.000Z',configDigest:'config',variantKey:null,metrics:[{itemId:'item',metricKey:'score',label:'得分'}]}],canQuality:false,canExport:false})
 render(<MemoryRouter><TrainingCourseAnalysis courseId="course" actorId="teacher"/></MemoryRouter>)
 const task=await screen.findByRole('combobox',{name:'波次 1 任务'})
 expect(screen.getByRole('region',{name:'参考构建入口'})).toHaveTextContent('teacher:course')
 expect(screen.getByRole('region',{name:'正式参考入口'})).toHaveTextContent('teacher')
 expect(task).toBeEnabled();fireEvent.click(screen.getByRole('button',{name:'模拟参考修改未保存'}))
 expect(task).toBeDisabled();expect(screen.getByRole('button',{name:'刷新分析来源'})).toBeDisabled()
 fireEvent.change(task,{target:{value:'task'}});expect(task).toHaveValue('');expect(m.analyze).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button',{name:'模拟参考修改已确认'}));expect(task).toBeEnabled()
 fireEvent.change(task,{target:{value:'task'}});expect(task).toHaveValue('task')
 expect(screen.getByRole('checkbox',{name:/得分/})).not.toBeChecked()
})
