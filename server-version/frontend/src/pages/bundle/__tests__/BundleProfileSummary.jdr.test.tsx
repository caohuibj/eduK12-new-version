import {it,expect} from 'vitest'
import {render,screen} from '@testing-library/react'
import BundleProfileSummary,{type BundleProfileView} from '../BundleProfileSummary'
// Exact deidentified view from the isolated saved JD-R report; no API or scoring mock.
const view:BundleProfileView={
  "schemaVersion": "bundle-profile-view-v1",
  "state": "MATCHED",
  "title": "要求较多、资源较多",
  "explanation": "从这次回答看，您近六个月的工作量和节奏带来较多要求，同时感受到的工作自主性、管理支持和同事支持整体较多。资源值得保留，但它们不意味着繁重的任务会自动消失。这是对本次工作条件的理论描述，不是对教学能力或个人价值的评价。",
  "profileId": "J2",
  "constructs": [
    {
      "key": "workplace.control",
      "label": "工作自主性（高分资源较多）",
      "raw": 4,
      "min": 1,
      "max": 5,
      "referenceCenter": 4
    },
    {
      "key": "workplace.demands",
      "label": "工作要求条件（原工具高分较有利）",
      "raw": 2,
      "min": 1,
      "max": 5,
      "referenceCenter": 2
    },
    {
      "key": "workplace.managerial_support",
      "label": "管理支持（高分资源较多）",
      "raw": 4,
      "min": 1,
      "max": 5,
      "referenceCenter": 4
    },
    {
      "key": "workplace.peer_support",
      "label": "同事支持（高分资源较多）",
      "raw": 4,
      "min": 1,
      "max": 5,
      "referenceCenter": 4
    }
  ],
  "candidates": [],
  "alternatives": [],
  "actions": [
    "个人层面：挑一项近期最耗时的重复任务，记录可协调或合并的环节，向合适的同事或负责人提出具体需要。",
    "组织层面：可与负责人讨论一项可调整的期限、流程或分工；已有支持不意味着繁重任务会自动消失。"
  ],
  "methods": {
    "key": "teacher_jdr_workplace_zh_cn",
    "version": "0.1.0",
    "hash": "08666d7372c7f588c4c8f5c2b171c5d35223e00f739024fdf6f1e78d1a3391d4",
    "mappingVersion": "0.1.0",
    "templateVersion": "0.1.0",
    "algorithm": "weighted-l1-guarded-v1",
    "maturity": "EXPERIMENTAL"
  },
  "limitation": "理论试验画像；预设中心与分界尚未经真实人群验证。匹配分不是概率或常模，不用于诊断、排名或能力判断。"
}
it('renders the JD-R report with four native ranges, self actions and generic wording, then respects the withheld view',()=>{
 const {rerender,container}=render(<BundleProfileSummary view={view}/>)
 expect(screen.getByRole('heading',{name:'要求较多、资源较多'})).toBeInTheDocument()
 expect(screen.getAllByRole('img')).toHaveLength(4)
 expect(screen.getByRole('img',{name:/工作要求条件.*本次2.*理论参照2/})).toBeInTheDocument()
 expect(screen.getByRole('table',{name:'原量尺结果文字表'})).toHaveTextContent('1—5')
 expect(screen.getByText(/个人层面：/)).toBeInTheDocument();expect(screen.getByText(/组织层面：/)).toBeInTheDocument()
 expect(container.textContent).not.toMatch(/数学|学习信念|三个原量尺|成本越高/)
 rerender(<BundleProfileSummary view={{...view,state:'WITHHELD',title:'当前权限未开放个体画像解释',explanation:null,profileId:null,methods:null,actions:[],constructs:view.constructs.map(c=>({...c,referenceCenter:null}))}}/>)
 expect(screen.queryByText(view.title)).not.toBeInTheDocument();expect(screen.queryByText(/个人层面：/)).not.toBeInTheDocument()
 expect(container.querySelectorAll('path')).toHaveLength(0);expect(container.textContent).not.toContain('J2')
})
