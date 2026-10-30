import {describe,it,expect,vi} from 'vitest'
import {render,screen} from '@testing-library/react'
import {PersonalChangesReport} from '../PersonalChangesReport'

const chartModule=vi.hoisted(()=>({loaded:vi.fn()}))
vi.mock('../ReportTrendChart',()=>{
  chartModule.loaded()
  return {ReportTrendChart:()=> <div>Deferred trend chart</div>}
})

describe('personal changes chart loading',()=>{
  it('loads no chart for waiting feedback and preserves numeric content during chart loading',async()=>{
    const view=render(<PersonalChangesReport report={{status:'WAITING'}}/>)
    expect(chartModule.loaded).not.toHaveBeenCalled()
    view.rerender(<PersonalChangesReport report={{status:'AVAILABLE',metrics:[{
      id:'score',label:'原始分',unit:'points',
      points:[{ordinal:1,value:0,observedAt:null,missingReason:null}],adjacent:[],baseline:[],
    }]}}/>)
    expect(screen.getByRole('cell',{name:'0'})).toBeInTheDocument()
    expect(await screen.findByText('Deferred trend chart')).toBeInTheDocument()
    expect(chartModule.loaded).toHaveBeenCalledTimes(1)
  })
})
