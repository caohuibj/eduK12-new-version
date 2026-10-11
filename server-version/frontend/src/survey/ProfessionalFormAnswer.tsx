/** Shared participant/editor renderer for the frozen V2 Form answer shapes.
 * Rendering never replaces the authoritative server FINAL validator.
 */
export type ProfessionalAnswer=string|number|string[]|Record<string,number>|{_surveyRefusal:true}|null
export type ProfessionalQuestion={
  itemKey:string;type:string;prompt:string;
  options:{optionKey:string;label:string}[];
  rows?:{rowKey:string;label:string}[];
  min?:number;max?:number;step?:number;integerOnly?:boolean;
  total?:number;minSelections?:number;maxSelections?:number;
  allowRefusal?:boolean;timeZone?:string
}
const refused=(value:ProfessionalAnswer|undefined):value is {_surveyRefusal:true}=>
  !!value&&typeof value==='object'&&!Array.isArray(value)&&'_surveyRefusal' in value
const asNumbers=(answer:ProfessionalAnswer|undefined):Record<string,number>=>
  answer&&typeof answer==='object'&&!Array.isArray(answer)&&!refused(answer)
    ?answer as Record<string,number>:{}
export function ProfessionalFormAnswer({question:q,answers,onAnswer,prefix}:{
  question:ProfessionalQuestion;answers:Record<string,ProfessionalAnswer>;
  onAnswer:(key:string,value:ProfessionalAnswer)=>void;prefix:string
}){
  const current=answers[q.itemKey]
  if(q.type==='DATE'||q.type==='TIME')return <div className="space-y-1">
    <input className="input block w-full" type={q.type==='DATE'?'date':'time'}
      aria-label={q.prompt} value={typeof current==='string'?current:''}
      disabled={refused(current)}
      onChange={e=>onAnswer(q.itemKey,e.target.value||null)}/>
    {q.type==='TIME'&&<p className="text-xs text-slate-600">
      时间解释时区：{q.timeZone==='UTC'?'UTC':'中国标准时间（UTC+08:00）'}；请填写 24 小时制。</p>}
  </div>
  if(q.type==='RANK_ORDER'){
    const all=q.options.map(o=>o.optionKey)
    const order=Array.isArray(current)&&current.length===all.length&&
      new Set(current).size===all.length&&current.every(key=>all.includes(key))?current:all
    const move=(index:number,delta:number)=>{
      const next=order.slice(),other=index+delta
      if(other<0||other>=next.length)return
      ;[next[index],next[other]]=[next[other],next[index]]
      onAnswer(q.itemKey,next)
    }
    return <div className="space-y-2">
      <p className="text-xs text-slate-600">从最优先到最不优先排序；使用按钮上下移动。</p>
      <ol className="space-y-2">{order.map((key,index)=><li key={key}
        className="flex flex-wrap gap-2 items-center border rounded p-2">
        <span className="flex-1 text-sm">{index+1}. {q.options.find(x=>x.optionKey===key)?.label}</span>
        <button className="btn-secondary" type="button" disabled={index===0}
          aria-label={'上移第 '+(index+1)+' 项'} onClick={()=>move(index,-1)}>↑</button>
        <button className="btn-secondary" type="button" disabled={index===order.length-1}
          aria-label={'下移第 '+(index+1)+' 项'} onClick={()=>move(index,1)}>↓</button>
      </li>)}</ol>
      {!Array.isArray(current)&&<button className="btn-secondary" type="button"
        onClick={()=>onAnswer(q.itemKey,order)}>确认当前排序</button>}
    </div>
  }
  if(q.type==='SLIDER'){
    const low=q.min??0,high=q.max??100
    const selected=typeof current==='number'&&Number.isFinite(current)?current:low
    return <div className="space-y-2">
      <div className="flex items-center gap-3">
        <span className="text-sm">{low}</span>
        <input className="flex-1" type="range" aria-label={q.prompt}
          min={low} max={high} step={q.step??(q.integerOnly?1:'any')}
          value={selected} disabled={refused(current)}
          onChange={e=>onAnswer(q.itemKey,Number(e.target.value))}/>
        <span className="text-sm">{high}</span>
      </div>
      <output className="text-sm">{typeof current==='number'?current:'尚未确认'}</output>
      {typeof current!=='number'&&!refused(current)&&<button type="button" className="btn-secondary ml-3"
        onClick={()=>onAnswer(q.itemKey,low)}>确认当前值</button>}
    </div>
  }
  if(q.type==='CONSTANT_SUM'){
    const numbers=asNumbers(current)
    const sum=q.options.reduce((n,o)=>n+(numbers[o.optionKey]??0),0)
    const incomplete=q.options.filter(o=>!Object.prototype.hasOwnProperty.call(numbers,o.optionKey)).length
    return <div className="space-y-2">
      {q.options.map(o=><label className="flex flex-wrap items-center gap-2 text-sm" key={o.optionKey}>
        <span className="flex-1">{o.label}</span>
        <input className="input w-28" type="number" aria-label={'分值：'+o.label}
          min="0" step={q.integerOnly?'1':'any'} disabled={refused(current)}
          value={Object.prototype.hasOwnProperty.call(numbers,o.optionKey)?numbers[o.optionKey]:''}
          onChange={e=>{
            const next={...numbers}
            if(e.target.value==='')delete next[o.optionKey]
            else next[o.optionKey]=Number(e.target.value)
            onAnswer(q.itemKey,Object.keys(next).length?next:null)
          }}/>
      </label>)}
      <p className={!incomplete&&Math.abs(sum-(q.total??0))<1e-7?'text-sm':'text-sm text-amber-800'}
        role="status">当前合计 {sum} / 目标 {q.total??0}
        {incomplete>0&&`；仍有 ${incomplete} 项未填写，留空不等于 0`}</p>
    </div>
  }
  if(q.type==='MATRIX_MULTIPLE')return <div className="space-y-3">
    <p className="text-xs text-slate-600">每行可多选，{q.minSelections??0} 至 {q.maxSelections??q.options.length} 项。</p>
    {(q.rows??[]).map(row=>{
      const k=q.itemKey+':'+row.rowKey
      const rowAnswer=answers[k],selected=Array.isArray(rowAnswer)?rowAnswer:[]
      return <fieldset key={row.rowKey} className="rounded border p-3 space-y-2">
        <legend className="font-medium text-sm">{row.label}</legend>
        <div className="grid gap-2 sm:grid-cols-2">{q.options.map(o=><label className="flex items-start gap-2 text-sm"
          key={o.optionKey}>
          <input type="checkbox" name={prefix+'-'+k+'-'+o.optionKey}
            checked={selected.includes(o.optionKey)} disabled={refused(rowAnswer)||
              (!selected.includes(o.optionKey)&&q.maxSelections!==undefined&&selected.length>=q.maxSelections)}
            onChange={e=>onAnswer(k,e.target.checked?[...selected,o.optionKey]:
              selected.filter(x=>x!==o.optionKey))}/>
          {o.label}</label>)}</div>
        {q.allowRefusal&&<label className="flex gap-2 items-center text-sm">
          <input type="checkbox" checked={refused(rowAnswer)}
            onChange={e=>onAnswer(k,e.target.checked?{_surveyRefusal:true}:null)}/>
          不愿回答本行</label>}
      </fieldset>
    })}</div>
  return null
}
