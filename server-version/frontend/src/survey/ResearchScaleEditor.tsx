import type { ScaleDraft } from './builder.types'
import { researchKey } from './builder.types'
export function ResearchScaleEditor({value,onChange}:{value:ScaleDraft;onChange:(next:ScaleDraft)=>void}){
  const setItem=(index:number,fn:(item:ScaleDraft['items'][number])=>ScaleDraft['items'][number])=>
    onChange({...value,items:value.items.map((x,i)=>i===index?fn(x):x)})
  return <div className="space-y-5">
    <section className="border rounded-xl p-4 space-y-3 bg-white">
      <h3 className="font-semibold">量表响应选项（共享选项组）</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        {value.responseOptions.map((option,i)=><div className="flex gap-2 items-center" key={option.optionKey}>
          <input className="input w-full" aria-label={'响应选项 '+(i+1)} value={option.label}
            onChange={e=>onChange({...value,responseOptions:value.responseOptions.map(x=>x.optionKey===option.optionKey?{...x,label:e.target.value}:x)})}/>
          <input className="input w-20" aria-label={'计分 '+(i+1)} type="number" value={option.score}
            onChange={e=>onChange({...value,responseOptions:value.responseOptions.map(x=>x.optionKey===option.optionKey?{...x,score:Number(e.target.value)}:x)})}/>
          <button type="button" className="btn-secondary" onClick={()=>onChange({...value,responseOptions:value.responseOptions.filter(x=>x.optionKey!==option.optionKey)})}>删除</button>
        </div>)}</div>
      <button type="button" className="btn-secondary" onClick={()=>onChange({...value,responseOptions:[...value.responseOptions,{optionKey:researchKey('o'),label:'新选项',score:value.responseOptions.length+1}]})}>新增选项</button>
    </section>
    <section className="border rounded-xl p-4 space-y-3 bg-white">
      <h3 className="font-semibold">维度（研究描述性得分，不提供常模）</h3>
      {value.dimensions.map((dim,i)=><div className="flex items-center gap-3" key={dim.dimensionKey}>
        <input className="input flex-1" aria-label={'维度 '+(i+1)} value={dim.label}
          onChange={e=>onChange({...value,dimensions:value.dimensions.map(x=>x.dimensionKey===dim.dimensionKey?{...x,label:e.target.value}:x)})}/>
        <select className="input" aria-label={'维度方向 '+(i+1)} value={dim.direction}
          onChange={e=>onChange({...value,dimensions:value.dimensions.map(x=>
            x.dimensionKey===dim.dimensionKey?{...x,direction:e.target.value as ScaleDraft['dimensions'][number]['direction']}:x)})}>
          <option value="descriptive">仅描述</option>
          <option value="higher_is_more">越高代表越多</option>
          <option value="higher_is_better">越高越好（研究性定义）</option>
          <option value="higher_is_worse">越高越差（研究性定义）</option>
          <option value="bipolar">双极方向</option>
        </select>
        <button type="button" className="btn-secondary" onClick={()=>onChange({...value,
          dimensions:value.dimensions.filter(x=>x.dimensionKey!==dim.dimensionKey),
          items:value.items.map(x=>({...x,dimensionKeys:x.dimensionKeys.filter(k=>k!==dim.dimensionKey)}))})}>删除</button>
      </div>)}
      <button type="button" className="btn-secondary" onClick={()=>onChange({...value,dimensions:[
        ...value.dimensions,{dimensionKey:researchKey('d'),label:'新维度',direction:'descriptive'},
      ]})}>新增维度</button>
      <label className="block text-sm">维度聚合
        <select className="input block" value={value.aggregation} onChange={e=>onChange({...value,aggregation:e.target.value as ScaleDraft['aggregation']})}>
          <option value="mean">平均分</option><option value="sum">总分</option>
        </select></label>
    </section>
    <section className="border rounded-xl p-4 space-y-3 bg-white">
      <div className="flex justify-between"><h3 className="font-semibold">量表题目</h3>
        <button type="button" className="btn-secondary" onClick={()=>onChange({...value,items:[
          ...value.items,{itemKey:researchKey('q'),prompt:'',required:true,reverse:false,
            dimensionKeys:value.dimensions.length?[value.dimensions[0].dimensionKey]:[]},
        ]})}>增加 Likert 题目</button></div>
      {value.items.map((q,i)=><article className="border bg-slate-50 rounded-lg p-3 space-y-3" key={q.itemKey}>
        <div className="flex gap-2 items-center"><strong className="text-sm">题 {i+1}</strong>
          <button type="button" className="btn-secondary" disabled={i===0}
            onClick={()=>{const items=value.items.slice();[items[i],items[i-1]]=[items[i-1],items[i]];onChange({...value,items})}}>↑</button>
          <button type="button" className="btn-secondary" disabled={i===value.items.length-1}
            onClick={()=>{const items=value.items.slice();[items[i],items[i+1]]=[items[i+1],items[i]];onChange({...value,items})}}>↓</button>
          <button type="button" className="btn-secondary" onClick={()=>onChange({...value,items:[
            ...value.items.slice(0,i+1),{...q,itemKey:researchKey('q'),dimensionKeys:[...q.dimensionKeys]},...value.items.slice(i+1)]})}>复制</button>
          <button type="button" className="btn-secondary" onClick={()=>onChange({...value,items:value.items.filter((_,k)=>k!==i)})}>删除</button>
        </div>
        <textarea className="input w-full" rows={2} aria-label={'题干 '+(i+1)} value={q.prompt}
          onChange={e=>setItem(i,x=>({...x,prompt:e.target.value}))}/>
        <label className="inline-flex gap-2 items-center"><input type="checkbox" checked={q.reverse}
          onChange={e=>setItem(i,x=>({...x,reverse:e.target.checked}))}/>反向计分</label>
        <fieldset className="flex flex-wrap gap-3 text-sm"><legend className="font-semibold">所属维度</legend>
          {value.dimensions.map(dim=><label key={dim.dimensionKey} className="inline-flex gap-1 items-center">
            <input type="checkbox" checked={q.dimensionKeys.includes(dim.dimensionKey)}
              onChange={e=>setItem(i,x=>({...x,dimensionKeys:e.target.checked?
                [...x.dimensionKeys,dim.dimensionKey]:x.dimensionKeys.filter(k=>k!==dim.dimensionKey)}))}/>
            {dim.label||dim.dimensionKey}</label>)}
        </fieldset>
      </article>)}
    </section>
  </div>
}
