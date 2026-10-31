import {describe,it,expect,vi} from 'vitest'
import {render,screen} from '@testing-library/react'
import {PersonalChangesReport} from '../PersonalChangesReport'
import {toPersonalChangesTrend,type PersonalChangesMetric} from '../longitudinalVisualization'
vi.mock('../ReportTrendChart',()=>({ReportTrendChart:({title}:{title:string})=><div>{title}趋势图</div>}))
const metric:PersonalChangesMetric={id:'a',label:'A 原始分',unit:'points',
  points:[{ordinal:1,value:0,observedAt:'2026-10-01T12:00:00Z',missingReason:null},{ordinal:2,value:null,observedAt:null,missingReason:'NOT_COMPLETED'},{ordinal:3,value:-2,observedAt:'2026-10-03T12:00:00Z',missingReason:null}],
  adjacent:[{fromOrdinal:1,toOrdinal:2,delta:null,comparability:{level:'EXACT',allowedOperations:['DESCRIPTIVE_TREND','NUMERIC_DELTA']}},{fromOrdinal:2,toOrdinal:3,delta:null,comparability:{level:'EXACT',allowedOperations:['DESCRIPTIVE_TREND','NUMERIC_DELTA']}}],
  baseline:[{fromOrdinal:1,toOrdinal:2,delta:null,intermediateMissing:false},{fromOrdinal:1,toOrdinal:3,delta:-2,intermediateMissing:true}]}
describe('Personal changes report',()=>{
  it('shows a disclosed wholly missing metric and its release/validity notes',()=>{
    const missingMetric:PersonalChangesMetric={...metric,id:'missing',label:'已披露 B',points:[
      {ordinal:1,value:null,observedAt:'2026-10-01T12:00:00Z',missingReason:'INVALID_OR_MISSING'},
      {ordinal:2,value:null,observedAt:'2026-10-02T12:00:00Z',missingReason:'PENDING_RELEASE'},
    ]}
    render(<PersonalChangesReport report={{status:'AVAILABLE',metrics:[metric,missingMetric]}}/>)
    expect(screen.getByRole('table',{name:'已披露 B各轮记录'})).toBeInTheDocument()
    expect(screen.getByRole('cell',{name:'指标无效或缺失'})).toBeInTheDocument()
    expect(screen.getByRole('cell',{name:'本轮指标尚未开放'})).toBeInTheDocument()
  })
  it('keeps zero, actual dates, signed baseline differences and a missing-wave note',()=>{
    render(<PersonalChangesReport report={{status:'AVAILABLE',metrics:[metric]}}/>)
    expect(screen.getByRole('cell',{name:'0'})).toBeInTheDocument()
    expect(screen.getByText(/相对基线 T1 → T3：-2 points（中间轮次缺失）/)).toBeInTheDocument()
    expect(screen.getByText('本轮未完成')).toBeInTheDocument()
    expect(screen.getByText(/2026\/10\/1/)).toBeInTheDocument()
    expect(toPersonalChangesTrend(metric).segments.map(s=>s.connect)).toEqual([false,false])
  })
  it('shows eligibility in the report response without a separate request',()=>{
    render(<PersonalChangesReport report={{status:'WAITING'}}/>)
    expect(screen.getByText(/两轮有效、可比较且允许本人查看/)).toBeInTheDocument()
  })
})
