import {useEffect,useRef,useState,type ReactNode} from 'react'
import {ArrowDown,ArrowUp,Copy,FileText,List,Plus,Trash2,Pencil} from 'lucide-react'
import {newQuestion,researchKey,type FormDraft,type FormQuestion} from './builder.types'
import './survey-form-studio.css'
const labels:Record<FormQuestion['type'],string>={SINGLE:'单选',MULTIPLE:'多选',SHORT_TEXT:'短文本',LONG_TEXT:'长文本',NUMBER:'数值',LIKERT:'Likert',MATRIX:'矩阵',DATE:'日期',TIME:'时间',RANK_ORDER:'排序',SLIDER:'滑块',CONSTANT_SUM:'恒定总和',MATRIX_MULTIPLE:'矩阵多选'}
type Props={value:FormDraft;onCommit:(next:FormDraft)=>Promise<boolean>;onDraftRiskChange?:(dirty:boolean)=>void;disabled?:boolean;renderQuestion:(value:FormDraft,onChange:(next:FormDraft)=>void,key:string,pageControl:ReactNode)=>ReactNode}
export function SurveyFormStudio({value,onCommit,onDraftRiskChange,disabled=false,renderQuestion}:Props){
  const [pageKey,setPageKey]=useState<string|null>(null),[editing,setEditing]=useState<string|null>(null),[question,setQuestion]=useState(()=>newQuestion('SINGLE'))
  const [renaming,setRenaming]=useState<{pageKey:string;title:string}|null>(null)
  const [changed,setChanged]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('')
  const lock=useRef(false),editGeneration=useRef(0)
  const page=value.pages.find(p=>p.pageKey===pageKey)??value.pages[0]
  const count=value.pages.reduce((n,p)=>n+p.questions.length,0)
  const risk=changed||!!editing||!!renaming
  useEffect(()=>{onDraftRiskChange?.(risk);return()=>onDraftRiskChange?.(false)},[risk,onDraftRiskChange])
  const blocked=disabled||busy
  const reset=()=>{setQuestion(newQuestion('SINGLE'));setEditing(null);setChanged(false);setError('')}
  const commit=async(next:FormDraft)=>{if(lock.current||disabled)return false;lock.current=true;setBusy(true);setError('');try{return await onCommit(next)}catch(cause){setError(cause instanceof Error?cause.message:'保存失败，内容仍保留');return false}finally{setBusy(false);lock.current=false}}
  const pick=(p:FormDraft['pages'][number],q:FormQuestion)=>{if(blocked||risk)return;setPageKey(p.pageKey);setEditing(q.itemKey);setQuestion(structuredClone(q));setChanged(false);setError('')}
  const submit=async()=>{
    const generation=editGeneration.current
    const target=page??{pageKey:researchKey('p'),title:'第 1 页',questions:[]}
    const nextPage={...target,questions:editing?target.questions.map(q=>q.itemKey===editing?question:q):[...target.questions,question]}
    const next={...value,pages:page?value.pages.map(p=>p.pageKey===target.pageKey?nextPage:p):[nextPage]}
    if(await commit(next)){setPageKey(target.pageKey);if(editGeneration.current===generation)reset();else{setEditing(question.itemKey);setChanged(true);setError('本次内容已保存，保存期间的新修改仍待保存。')}}
  }
  const movePage=async(index:number,by:number)=>{const pages=[...value.pages];[pages[index],pages[index+by]]=[pages[index+by],pages[index]];await commit({...value,pages})}
  const moveQuestion=async(p:FormDraft['pages'][number],index:number,by:number)=>{const questions=[...p.questions];[questions[index],questions[index+by]]=[questions[index+by],questions[index]];await commit({...value,pages:value.pages.map(x=>x.pageKey===p.pageKey?{...p,questions}:x)})}
  const copy=async(p:FormDraft['pages'][number],q:FormQuestion,index:number)=>{
    const options=q.options.map(o=>({...o,optionKey:researchKey('o')})),remap=new Map(q.options.map((o,i)=>[o.optionKey,options[i].optionKey]))
    const clone={...structuredClone(q),itemKey:researchKey('q'),options,rows:q.rows.map(row=>({...row,rowKey:researchKey('r')})),otherOptionKey:q.otherOptionKey?remap.get(q.otherOptionKey):undefined,exclusiveOptionKeys:q.exclusiveOptionKeys?.map(k=>remap.get(k)!).filter(Boolean)}
    await commit({...value,pages:value.pages.map(x=>x.pageKey===p.pageKey?{...p,questions:[...p.questions.slice(0,index+1),clone,...p.questions.slice(index+1)]}:x)})
  }
  const workingPage=page??{pageKey:'new_page',title:'第 1 页',questions:[]}
  const working={...value,pages:page?value.pages.map(p=>p===page?{...p,questions:editing||p.questions.some(q=>q.itemKey===question.itemKey)?p.questions.map(q=>q.itemKey===(editing??question.itemKey)?question:q):[...p.questions,question]}:p):[{...workingPage,questions:[question]}]}
  const visibleFields=value.pages.flatMap(p=>p.questions).reduce((n,q)=>n+(['MATRIX','MATRIX_MULTIPLE'].includes(q.type)?q.rows.length:1)+(q.otherOptionKey?1:0),0)
  const pageControl=<label className="survey-form-target-page">所属分页<select className="input" disabled={!!editing||changed} value={page?.pageKey??''} onChange={event=>setPageKey(event.target.value)}>{value.pages.length?value.pages.map(p=><option key={p.pageKey} value={p.pageKey}>{p.title}</option>):<option value="">第 1 页（添加题目时创建）</option>}</select></label>
  return <section className="survey-form-studio" aria-label="表单编制工作区">
    <header className="survey-form-content-heading"><h2>题目编辑 <span>{count} 道题目</span></h2><span className="survey-form-save-note">操作成功后即保存</span></header>
    {disabled&&<p className="survey-library-notice" role="status">表单信息尚未保存，请先保存表单信息，再编辑题目。</p>}
    {error&&<p className="survey-library-error" role="alert">{error}</p>}
    <div className="survey-form-builder">
      <aside className="survey-form-directory" aria-label="表单题目目录"><header><List size={17}/><strong>题目目录</strong><span>{count}</span></header>
        {value.pages.length?<div className="survey-form-directory-pages">{value.pages.map((p,pi)=><div key={p.pageKey}><div className="survey-form-directory-page-row"><button type="button" className="survey-form-directory-page" disabled={blocked||risk} aria-pressed={p===page} onClick={()=>setPageKey(p.pageKey)}>{pi+1}. {p.title||'未命名分页'}</button><div className="survey-form-order-actions"><button type="button" aria-label={'重命名分页：'+p.title} disabled={blocked||risk} onClick={()=>setRenaming({pageKey:p.pageKey,title:p.title})}><Pencil size={13}/></button><button type="button" aria-label={'上移分页：'+p.title} disabled={blocked||risk||pi===0} onClick={()=>void movePage(pi,-1)}><ArrowUp size={13}/></button><button type="button" aria-label={'下移分页：'+p.title} disabled={blocked||risk||pi===value.pages.length-1} onClick={()=>void movePage(pi,1)}><ArrowDown size={13}/></button></div></div>
          {renaming?.pageKey===p.pageKey&&<div className="survey-form-page-rename"><input className="input" aria-label="分页标题" maxLength={200} value={renaming.title} disabled={blocked} onChange={event=>setRenaming({...renaming,title:event.target.value})}/><button type="button" className="btn-secondary" disabled={blocked||!renaming.title.trim()} onClick={()=>void commit({...value,pages:value.pages.map(x=>x===p?{...p,title:renaming.title.trim()}:x)}).then(ok=>{if(ok)setRenaming(null)})}>保存分页标题</button><button type="button" className="btn-secondary" disabled={blocked} onClick={()=>setRenaming(null)}>取消</button></div>}
          <ol>{p.questions.map((q,qi)=><li key={q.itemKey}><button type="button" aria-label={'编辑题目：'+q.prompt} aria-pressed={editing===q.itemKey} disabled={blocked||risk} onClick={()=>pick(p,q)}><span>{value.pages.slice(0,pi).reduce((n,previous)=>n+previous.questions.length,0)+qi+1}</span><span><strong>{q.prompt||'未填写题干'}</strong><small>{labels[q.type]} · {q.required?'必答':'选答'}</small></span><Pencil size={13}/></button><div className="survey-form-item-actions"><button type="button" aria-label={'上移题目：'+q.prompt} disabled={blocked||risk||qi===0} onClick={()=>void moveQuestion(p,qi,-1)}><ArrowUp size={13}/></button><button type="button" aria-label={'下移题目：'+q.prompt} disabled={blocked||risk||qi===p.questions.length-1} onClick={()=>void moveQuestion(p,qi,1)}><ArrowDown size={13}/></button><button type="button" aria-label={'复制题目：'+q.prompt} disabled={blocked||risk} onClick={()=>void copy(p,q,qi)}><Copy size={13}/></button><button type="button" aria-label={'移除题目：'+q.prompt} disabled={blocked||risk} onClick={()=>void commit({...value,pages:value.pages.map(x=>x===p?{...p,questions:p.questions.filter(item=>item!==q)}:x)})}><Trash2 size={13}/></button></div></li>)}</ol>
          {!p.questions.length&&<p className="survey-form-page-empty">这个分页还没有题目。<button type="button" disabled={blocked||risk} onClick={()=>void commit({...value,pages:value.pages.filter(x=>x!==p)})}>移除空分页</button></p>}
        </div>)}</div>:<div className="survey-form-directory-empty"><FileText size={28}/><strong>还没有题目</strong><p>在编辑区写下第一道题，添加后会出现在这里。</p></div>}
        <p className="survey-form-directory-help">{risk?'保存或取消当前修改后，可选择其他题目。':'点击题目即可编辑；分页和题目顺序可用箭头调整。'}</p>
        <button type="button" className="survey-form-add-page" disabled={blocked||risk} onClick={()=>{const p={pageKey:researchKey('p'),title:'第 '+(value.pages.length+1)+' 页',questions:[]};void commit({...value,pages:[...value.pages,p]}).then(ok=>{if(ok)setPageKey(p.pageKey)})}}><Plus size={15}/>新增分页</button>
      </aside>
      <section className="survey-form-current-editor" aria-label={editing?'当前题目编辑区':'新题目编辑区'}><header><span>{editing?<Pencil size={20}/>:<Plus size={20}/>}</span><div><h3>{editing?'编辑题目':'添加新题'}</h3></div><details className="survey-form-compose-help"><summary>操作说明</summary><p>{editing?'修改后点击“保存题目修改”；取消编辑会放弃本次修改。':'选择题型，填写题干和选项，再点击“添加题目”。'}</p></details></header>
        <fieldset disabled={blocked||!!renaming}><legend className="sr-only">{editing?'编辑题目':'添加新题'}</legend>
          {renderQuestion(working,next=>{const updated=next.pages.flatMap(p=>p.questions).find(q=>q.itemKey===question.itemKey);if(updated){editGeneration.current++;setQuestion(updated);setChanged(true)}},question.itemKey,pageControl)}
          <div className="survey-form-commit-actions"><button type="button" className="btn-primary" disabled={!question.prompt.trim()||editing!==null&&!changed} onClick={()=>void submit()}>{busy?'正在保存…':editing?'保存题目修改':'添加题目'}</button>{risk&&<button type="button" className="btn-secondary" onClick={reset}>{editing?'取消编辑':'清空新题'}</button>}</div>
        </fieldset>
        <p className="survey-form-field-budget">已保存作答字段 {visibleFields}/500 · 矩阵每行和其他填写各计 1 个字段</p>
      </section>
    </div>
    {value.schemaVersion===1&&<details className="survey-form-compatibility"><summary>旧版兼容表单 · 扩展题型说明</summary><p>旧版保留原有题型。启用扩展题型后可使用日期、时间、排序、滑块、恒定总和、矩阵多选，以及其他填写、互斥选项和输入格式限制。新建表单默认具备这些能力。</p><p>只更新此工具草稿；已有研究或冻结发布的内容不会被改写。</p><button type="button" className="btn-secondary" disabled={blocked||risk} onClick={()=>void commit({...value,schemaVersion:2})}>启用扩展题型</button></details>}
  </section>
}
