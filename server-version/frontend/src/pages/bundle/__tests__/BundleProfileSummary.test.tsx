import {it,expect} from 'vitest'
import {render,screen} from '@testing-library/react'
import BundleProfileSummary,{type BundleProfileView} from '../BundleProfileSummary'
const view:BundleProfileView={schemaVersion:'bundle-profile-view-v1',state:'MATCHED',title:'看重学习，但把握与负担形成拉扯',explanation:'认为数学重要，但把握偏弱且报告较多时间与取舍负担。',profileId:'P4',alternatives:[],constructs:[
  {key:'e',label:'数学学习把握感',raw:2.2,min:1,max:5,referenceCenter:1.8},
  {key:'v',label:'数学重要性与用途价值',raw:5,min:1,max:6,referenceCenter:5},
  {key:'c',label:'数学时间与取舍成本',raw:5,min:1,max:6,referenceCenter:5},
],candidates:[],actions:[],methods:{key:'learning_motivation_math_support',version:'0.1.0',hash:'frozen-model',mappingVersion:'0.1.0',templateVersion:'0.1.0',algorithm:'weighted-l1-guarded-v1',maturity:'EXPERIMENTAL'},limitation:'理论试验画像；匹配分不是概率或常模，不用于诊断。'}
it('renders independent original ranges and an equivalent table, then consumes the server-withheld view',()=>{
  const {rerender,container}=render(<BundleProfileSummary view={view}/>)
  expect(screen.getAllByRole('img')).toHaveLength(3)
  expect(screen.getByRole('img',{name:'数学学习把握感，本次2.2，量尺1至5，理论参照1.8'})).toBeInTheDocument()
  expect(screen.getByRole('table',{name:'原量尺结果文字表'})).toHaveTextContent('1—5')
  expect(screen.getByText(/匹配分不是概率或常模/)).toBeInTheDocument()
  expect(screen.queryByText('可以尝试的下一步')).not.toBeInTheDocument()
  rerender(<BundleProfileSummary view={{...view,state:'WITHHELD',title:'当前权限未开放个体画像解释',explanation:null,profileId:null,methods:null,constructs:view.constructs.map(c=>({...c,referenceCenter:null}))}}/>)
  expect(screen.queryByText(view.title)).not.toBeInTheDocument()
  expect(screen.queryByText(view.explanation!)).not.toBeInTheDocument()
  expect(screen.getAllByRole('img')).toHaveLength(3)
  expect(container.textContent).not.toContain('P4')
  expect(container.querySelectorAll('path')).toHaveLength(0)
})
