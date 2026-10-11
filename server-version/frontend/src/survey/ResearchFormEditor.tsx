import type { FormDraft, FormQuestion } from './builder.types'
import { choiceTypes, professionalTypes, newOption, newQuestion, researchKey } from './builder.types'
import { SurveyImageField } from './SurveyImageField'

const types:Record<FormQuestion['type'],string>={
  SINGLE:'单选',MULTIPLE:'多选',SHORT_TEXT:'短文本',LONG_TEXT:'长文本',
  NUMBER:'数值',LIKERT:'Likert',MATRIX:'矩阵',
  DATE:'日期',TIME:'时间',RANK_ORDER:'排序',SLIDER:'滑块',
  CONSTANT_SUM:'恒定总和',MATRIX_MULTIPLE:'矩阵多选',
}
export function ResearchFormEditor({value,onChange,projectId}:{value:FormDraft;
  onChange:(next:FormDraft)=>void;projectId:string}){
  const setPage=(index:number,update:(p:FormDraft['pages'][number])=>FormDraft['pages'][number])=>{
    const pages=value.pages.map((p,i)=>i===index?update(p):p)
    const upgraded=pages.some(p=>p.questions.some(q=>professionalTypes.has(q.type)))
    onChange({...value,pages,schemaVersion:upgraded?2:value.schemaVersion})
  }
  const setQuestion=(pi:number,qi:number,update:(q:FormQuestion)=>FormQuestion)=>
    setPage(pi,page=>({...page,questions:page.questions.map((q,i)=>i===qi?update(q):q)}))
  const fieldCount=value.pages.flatMap(p=>p.questions).reduce((n,q)=>n+(['MATRIX','MATRIX_MULTIPLE'].includes(q.type)?q.rows.length:1),0)
  const move=(pi:number,qi:number,by:number)=>{
    setPage(pi,page=>{const questions=page.questions.slice(),other=qi+by
      if(other>=0&&other<questions.length)[questions[qi],questions[other]]=[questions[other],questions[qi]]
      return {...page,questions}
    })
  }
  return <div className="space-y-5">
    <div className="flex flex-wrap gap-2 items-center">
      <h3 className="font-semibold">Form 问卷页面 · V{value.schemaVersion}</h3>
      <span className={fieldCount>500?'text-red-700 text-sm':'text-slate-600 text-sm'}
        role={fieldCount>500?'alert':undefined}>作答字段 {fieldCount}/500（矩阵每行计 1）</span>
      {value.schemaVersion===1&&<button type="button" className="btn-secondary"
        onClick={()=>onChange({...value,schemaVersion:2})}>
        升级为 Form V2（生成新冻结版本）</button>}
      <button type="button" className="btn-secondary" onClick={()=>onChange({...value,pages:[...value.pages,
        {pageKey:researchKey('p'),title:'第 '+(value.pages.length+1)+' 页',questions:[]}]})}>新增分页</button>
    </div>
    {value.pages.map((page,pi)=><section className="rounded-xl border p-4 bg-white space-y-4" key={page.pageKey}>
      <header className="flex items-center gap-2">
        <input className="input flex-1" aria-label={'第 '+(pi+1)+' 页标题'} value={page.title}
          onChange={e=>setPage(pi,p=>({...p,title:e.target.value}))}/>
        <button className="btn-secondary" type="button" disabled={pi===0} aria-label="上移分页"
          onClick={()=>{const copy=value.pages.slice();[copy[pi],copy[pi-1]]=[copy[pi-1],copy[pi]];onChange({...value,pages:copy})}}>↑</button>
        <button className="btn-secondary" type="button" disabled={pi===value.pages.length-1} aria-label="下移分页"
          onClick={()=>{const copy=value.pages.slice();[copy[pi],copy[pi+1]]=[copy[pi+1],copy[pi]];onChange({...value,pages:copy})}}>↓</button>
        <button type="button" className="btn-secondary" onClick={()=>onChange({...value,pages:value.pages.filter((_,i)=>i!==pi)})}>删除页</button>
      </header>
      {page.questions.map((q,qi)=>{
        const previous=[...value.pages.slice(0,pi).flatMap(p=>p.questions),...page.questions.slice(0,qi)]
          .filter(q=>['SINGLE','MULTIPLE','LIKERT'].includes(q.type))
        return <article key={q.itemKey} id={'survey-form-'+q.itemKey} tabIndex={-1}
          className="border rounded-lg p-3 bg-slate-50 space-y-3 scroll-mt-4">
          <div className="flex flex-wrap gap-2 items-center">
            <strong className="text-sm">题目 {qi+1}</strong>
            <select className="input" aria-label="选择题型" value={q.type} onChange={e=>{
              const type=e.target.value as FormQuestion['type']
              const fresh=newQuestion(type)
              setQuestion(pi,qi,old=>({...fresh,itemKey:old.itemKey,prompt:old.prompt,required:old.required,allowRefusal:old.allowRefusal}))
            }}>{Object.entries(types).map(([kind,name])=><option key={kind} value={kind}>{name}</option>)}</select>
            <button type="button" className="btn-secondary" disabled={qi===0} onClick={()=>move(pi,qi,-1)}>上移</button>
            <button type="button" className="btn-secondary" disabled={qi===page.questions.length-1} onClick={()=>move(pi,qi,1)}>下移</button>
            <button type="button" className="btn-secondary" onClick={()=>setPage(pi,p=>({...p,questions:[
              ...p.questions.slice(0,qi+1),{...structuredClone(q),itemKey:researchKey('q'),
                options:q.options.map(o=>({...o,optionKey:researchKey('o')})),
                rows:q.rows.map(o=>({...o,rowKey:researchKey('r')}))},
              ...p.questions.slice(qi+1)]}))}>复制</button>
            <button type="button" className="btn-secondary" onClick={()=>setPage(pi,p=>({...p,questions:p.questions.filter((_,i)=>i!==qi)}))}>删除</button>
          </div>
          <label className="block text-sm">题干
            <textarea className="input w-full block" rows={2} value={q.prompt}
              onChange={e=>setQuestion(pi,qi,x=>({...x,prompt:e.target.value}))}/>
          </label>
          <div className="flex gap-4 flex-wrap">
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox" checked={q.required}
              onChange={e=>setQuestion(pi,qi,x=>({...x,required:e.target.checked}))}/>必答</label>
            <label className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" checked={q.allowRefusal===true}
                onChange={e=>setQuestion(pi,qi,x=>({...x,allowRefusal:e.target.checked}))}/>
              允许明确选择「不愿回答」（单独记为 REFUSED）
            </label>
          </div>
          <SurveyImageField projectId={projectId} image={q.image}
            onChange={image=>setQuestion(pi,qi,x=>({...x,image}))}/>
          {choiceTypes.has(q.type)&&<div className="space-y-2">
            <p className="text-sm font-medium">选项</p>
            {q.options.map((o,oi)=><div className="flex gap-2" key={o.optionKey}>
              <input className="input flex-1" aria-label={'选项 '+(oi+1)} value={o.label}
                onChange={e=>setQuestion(pi,qi,x=>({...x,options:x.options.map(a=>a.optionKey===o.optionKey?{...a,label:e.target.value}:a)}))}/>
              <button className="btn-secondary" type="button" onClick={()=>setQuestion(pi,qi,x=>({...x,
                options:x.options.filter(a=>a.optionKey!==o.optionKey)}))}>删除</button>
            </div>)}
            <button type="button" className="btn-secondary" onClick={()=>setQuestion(pi,qi,x=>({...x,options:[...x.options,newOption()]}))}>增加选项</button>
          </div>}
          {['MATRIX','MATRIX_MULTIPLE'].includes(q.type)&&<div className="space-y-2">
            <p className="text-sm font-medium">矩阵行</p>
            {q.rows.map((row,ri)=><div key={row.rowKey} className="flex gap-2">
              <input className="input flex-1" aria-label={'矩阵行 '+(ri+1)} value={row.label}
                onChange={e=>setQuestion(pi,qi,x=>({...x,rows:x.rows.map(a=>a.rowKey===row.rowKey?{...a,label:e.target.value}:a)}))}/>
              <button className="btn-secondary" type="button" onClick={()=>setQuestion(pi,qi,x=>({...x,rows:x.rows.filter(a=>a.rowKey!==row.rowKey)}))}>删除</button>
            </div>)}
            <button type="button" className="btn-secondary" onClick={()=>setQuestion(pi,qi,x=>({...x,rows:[...x.rows,{rowKey:researchKey('r'),label:'新行'}]}))}>增加矩阵行</button>
          </div>}
          {['NUMBER','SLIDER'].includes(q.type)&&<div className="grid sm:grid-cols-2 gap-3">
            <label className="text-sm inline-flex gap-2 items-center"><input type="checkbox"
              checked={q.integerOnly===true} onChange={e=>setQuestion(pi,qi,x=>({...x,
                integerOnly:e.target.checked,precision:e.target.checked?0:x.precision,
                step:e.target.checked&&x.step!==undefined&&!Number.isInteger(x.step)?undefined:x.step}))}/>只允许整数</label>
            <label className="block text-sm">步长（留空表示任意）
              <input className="input block w-full" type="number" min="0" step="any"
                value={q.step??''} onChange={e=>setQuestion(pi,qi,x=>({...x,
                  step:e.target.value===''?undefined:Number(e.target.value)}))}/></label>
            <label className="block text-sm">最大小数位（留空表示不限制）
              <input className="input block w-full" type="number" min="0" max="8" step="1"
                disabled={q.integerOnly} value={q.precision??''}
                onChange={e=>setQuestion(pi,qi,x=>({...x,precision:e.target.value===''?undefined:Number(e.target.value)}))}/></label>
            {(['min','max'] as const).map(k=><label className="block text-sm" key={k}>{k==='min'?'最小值':'最大值'}
              <input className="input block w-full" type="number" step="any" value={q[k]??''}
                onChange={e=>setQuestion(pi,qi,x=>({...x,[k]:e.target.value===''?undefined:Number(e.target.value)}))}/></label>)}
          </div>}
          {q.type==='CONSTANT_SUM'&&<div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">指定总和
              <input className="input block w-full" type="number" min="0" step="any"
                value={q.total??100} onChange={e=>setQuestion(pi,qi,x=>({...x,total:Number(e.target.value)}))}/></label>
            <label className="inline-flex items-center gap-2 text-sm"><input type="checkbox"
              checked={q.integerOnly===true} onChange={e=>setQuestion(pi,qi,x=>({...x,integerOnly:e.target.checked}))}/>
              每项必须为整数</label>
          </div>}
          {['MULTIPLE','MATRIX_MULTIPLE'].includes(q.type)&&<div className="grid sm:grid-cols-2 gap-3">
            {(['minSelections','maxSelections'] as const).map(k=><label className="block text-sm" key={k}>
              {k==='minSelections'?'最少选择':'最多选择'}（留空不限）
              <input className="input block w-full" type="number" min="1" max="30" step="1"
                value={q[k]??''} onChange={e=>setQuestion(pi,qi,x=>({...x,
                  [k]:e.target.value===''?undefined:Number(e.target.value)}))}/></label>)}
          </div>}
          {q.type==='TIME'&&<label className="block text-sm">研究时间时区
            <select className="input block" value={q.timeZone??'Asia/Shanghai'}
              onChange={e=>setQuestion(pi,qi,x=>({...x,timeZone:e.target.value as 'UTC'|'Asia/Shanghai'}))}>
              <option value="Asia/Shanghai">中国标准时间（UTC+08:00）</option>
              <option value="UTC">UTC</option></select></label>}
          {['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&<label className="block text-sm">字数上限
            <input className="input block" type="number" min="1" max="10000" value={q.maxLength??''}
              onChange={e=>setQuestion(pi,qi,x=>({...x,maxLength:e.target.value===''?undefined:Number(e.target.value)}))}/></label>}
          {['SHORT_TEXT','LONG_TEXT'].includes(q.type)&&<label className="block text-sm">输入格式
            <select className="input block" value={q.textValidation??''}
              onChange={e=>setQuestion(pi,qi,x=>({...x,
                textValidation:e.target.value?e.target.value as 'EMAIL'|'DIGITS'|'ALPHANUMERIC':undefined}))}>
              <option value="">不限制</option><option value="EMAIL">邮箱</option>
              <option value="DIGITS">仅数字</option><option value="ALPHANUMERIC">英文字母与数字</option>
            </select></label>}
          {previous.length>0&&<div className="grid sm:grid-cols-2 gap-3">
            <label className="block text-sm">显示条件
              <select className="input block w-full" value={q.displayIf?.itemKey||''}
                onChange={e=>{const item=previous.find(a=>a.itemKey===e.target.value)
                  setQuestion(pi,qi,x=>({...x,displayIf:item?{itemKey:item.itemKey,operator:item.type==='MULTIPLE'?'INCLUDES':'EQUALS',optionKey:item.options[0]?.optionKey||''}:undefined}))
                }}>
                <option value="">始终显示</option>
                {previous.map(item=><option value={item.itemKey} key={item.itemKey}>{item.prompt||item.itemKey}</option>)}
              </select>
            </label>
            {q.displayIf&&<label className="block text-sm">前题选项
              <select className="input block w-full" value={q.displayIf.optionKey}
                onChange={e=>setQuestion(pi,qi,x=>({...x,displayIf:{...q.displayIf!,optionKey:e.target.value}}))}>
                {(previous.find(item=>item.itemKey===q.displayIf?.itemKey)?.options||[]).map(o=>
                  <option key={o.optionKey} value={o.optionKey}>{o.label||o.optionKey}</option>)}
              </select>
            </label>}
          </div>}
        </article>
      })}
      <div className="flex flex-wrap gap-2">{Object.entries(types).map(([type,title])=>
        <button type="button" className="btn-secondary" key={type}
          onClick={()=>setPage(pi,p=>({...p,questions:[...p.questions,newQuestion(type as FormQuestion['type'])]}))}>
          + {title}</button>)}</div>
    </section>)}
    {!value.pages.length&&<p className="text-sm text-slate-500">先新增一个分页，再添加题目；也可使用批量导入自动创建第一页。</p>}
  </div>
}
