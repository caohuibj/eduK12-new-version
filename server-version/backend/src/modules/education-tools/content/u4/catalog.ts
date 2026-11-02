import type {FormDraft} from '../../../assessment-core/form/definition'
import f0 from './u4-tr36.json'
import f1 from './u4-tr-reflection.json'
import f2 from './u4-sr24.json'
import f3 from './u4-sr-experience8.json'
import f4 from './u4-sr-primary12.json'
import f5 from './u4-k2-interview.json'
import f6 from './u4-ob24.json'
import f7 from './u4-ob-evidence.json'
import f8 from './u4-sj-reflection.json'
type Candidate={key:string;title:string;responseMode:'SELF'|'STUDENT_REPORT'|'EXPERT_REPORT'|'INTERVIEW';definition:FormDraft;scope:string}
const base:Candidate[]=[
{"key": "u4-tr36", "title": "教师实践自报｜36题｜候选0.3.0", "responseMode": "SELF", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f0 as FormDraft},
{"key": "u4-tr-reflection", "title": "教师专属反思｜可选无分", "responseMode": "SELF", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f1 as FormDraft},
{"key": "u4-sr24", "title": "学生课堂经历｜6–12年级｜24题候选0.3.0", "responseMode": "STUDENT_REPORT", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f2 as FormDraft},
{"key": "u4-sr-experience8", "title": "学生独特学习体验｜8项独立候选单题", "responseMode": "STUDENT_REPORT", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f3 as FormDraft},
{"key": "u4-sr-primary12", "title": "学生课堂经历｜3–5年级｜12题候选0.3.0", "responseMode": "STUDENT_REPORT", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f4 as FormDraft},
{"key": "u4-k2-interview", "title": "K–2中性访谈记录｜无分候选", "responseMode": "INTERVIEW", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f5 as FormDraft},
{"key": "u4-ob24", "title": "课堂观察｜24条线索｜无分证据判断", "responseMode": "EXPERT_REPORT", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f6 as FormDraft},
{"key": "u4-ob-evidence", "title": "课堂观察｜独立事件证据记录", "responseMode": "EXPERT_REPORT", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f7 as FormDraft},
{"key": "u4-sj-reflection", "title": "情境判断后反思｜可选无分", "responseMode": "SELF", "scope": "研究候选，待内容审阅；各来源独立使用，无跨模式总分。",definition:f8 as FormDraft},
]
const candidates=[...base]
for(const candidate of base.filter(c=>['u4-tr36','u4-sr24','u4-ob24','u4-sr-experience8'].includes(c.key))){
 const pages=candidate.key==='u4-sr-experience8'?candidate.definition.pages[0].questions.map(q=>({...candidate.definition.pages[0],pageKey:q.itemKey,title:q.prompt,questions:[q]})):candidate.definition.pages
 for(const page of pages){
  const d=structuredClone(candidate.definition),keys=new Set(page.questions.map(q=>q.itemKey));d.pages=[structuredClone(page)]
  if(d.descriptive){d.descriptive.items=d.descriptive.items.filter(i=>keys.has(i.itemKey));d.descriptive.groups=d.descriptive.groups.filter(g=>g.itemKeys.every(k=>keys.has(k)))}
  candidates.push({...candidate,key:candidate.key+'--'+page.pageKey,title:candidate.title+'｜'+page.title,definition:d,scope:'独立内容专题；不是已验证的独立分量表。保留原响应、来源和施测窗口。'})
 }
}
export const u4CandidateList=()=>candidates.map(({definition,...c})=>({...c,questions:definition.pages.reduce((n,p)=>n+p.questions.length,0)}))
export const u4Candidate=(key:string)=>{const c=candidates.find(c=>c.key===key);return c?structuredClone(c):null}
