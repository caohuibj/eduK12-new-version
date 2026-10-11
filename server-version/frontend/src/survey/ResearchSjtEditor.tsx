import type { SjtDraft } from './builder.types'
import { researchKey } from './builder.types'
export function ResearchSjtEditor({value,onChange}:{value:SjtDraft;onChange:(next:SjtDraft)=>void}){
  const changeQuestion=(i:number,fn:(q:SjtDraft['questions'][number])=>SjtDraft['questions'][number])=>
    onChange({...value,questions:value.questions.map((q,index)=>i===index?fn(q):q)})
  const newContributions=()=>Object.fromEntries(value.metrics.map(m=>[m.metricKey,0]))
  return <div className="space-y-5">
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">共享场景</h3>
      <label className="block text-sm">场景标题
        <input className="input block w-full" value={value.title} onChange={e=>onChange({...value,title:e.target.value})}/></label>
      <label className="block text-sm">场景描述
        <textarea className="input block w-full" rows={5} value={value.stimulus}
          onChange={e=>onChange({...value,stimulus:e.target.value})}/></label>
      <label className="block text-sm">参与者类型
        <select className="input block" value={value.respondentType}
          onChange={e=>onChange({...value,respondentType:e.target.value as SjtDraft['respondentType']})}>
          <option value="student_self_report">学生</option><option value="teacher_self_report">教师</option>
        </select></label>
      <p className="text-xs text-slate-600">PR2 复用现有 SJT 编译器的学生/教师执行契约。其他研究参与者类型须在 PR3 运行时适配确认后才能发布。</p>
    </section>
    <section className="bg-white border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">测量构念与评分贡献</h3>
      {value.metrics.map((m,i)=><div key={m.metricKey} className="flex gap-2">
        <input className="input flex-1" aria-label={'构念 '+(i+1)} value={m.label}
          onChange={e=>onChange({...value,metrics:value.metrics.map(x=>x.metricKey===m.metricKey?{...x,label:e.target.value}:x)})}/>
        <button type="button" className="btn-secondary" onClick={()=>onChange({...value,
          metrics:value.metrics.filter(x=>x.metricKey!==m.metricKey),
          questions:value.questions.map(q=>({...q,options:q.options.map(o=>{
            const contributions={...o.contributions};delete contributions[m.metricKey]
            return {...o,contributions}
          })}))})}>删除</button></div>)}
      <button type="button" className="btn-secondary" onClick={()=>{
        const metricKey=researchKey('c')
        onChange({...value,metrics:[...value.metrics,{metricKey,label:'新构念',direction:'descriptive'}],
          questions:value.questions.map(q=>({...q,options:q.options.map(o=>({...o,
            contributions:{...o.contributions,[metricKey]:0}}))}))})
      }}>增加构念</button>
    </section>
    <section className="bg-white border rounded-xl p-4 space-y-4">
      <div className="flex justify-between"><h3 className="font-semibold">同一场景的题目</h3>
        <button type="button" className="btn-secondary" onClick={()=>onChange({...value,questions:[...value.questions,
          {questionKey:researchKey('q'),prompt:'',options:[
            {optionKey:researchKey('o'),label:'新选项 1',contributions:newContributions()},
            {optionKey:researchKey('o'),label:'新选项 2',contributions:newContributions()},
          ]}]})}>增加问题</button></div>
      {value.questions.map((q,i)=><article className="border rounded-lg p-3 bg-slate-50 space-y-3" key={q.questionKey}>
        <div className="flex gap-3 justify-between"><strong>问题 {i+1}</strong>
          <button type="button" className="btn-secondary" onClick={()=>onChange({...value,questions:value.questions.filter(x=>x.questionKey!==q.questionKey)})}>删除问题</button></div>
        <textarea className="input w-full" aria-label={'情境问题 '+(i+1)} rows={2} value={q.prompt}
          onChange={e=>changeQuestion(i,x=>({...x,prompt:e.target.value}))}/>
        {q.options.map((o,j)=><div className="p-2 bg-white border rounded-lg" key={o.optionKey}>
          <div className="flex gap-2">
            <input className="input flex-1" aria-label={'问题 '+(i+1)+' 选项 '+(j+1)} value={o.label}
              onChange={e=>changeQuestion(i,x=>({...x,options:x.options.map(y=>y.optionKey===o.optionKey?{...y,label:e.target.value}:y)}))}/>
            <button type="button" className="btn-secondary" onClick={()=>changeQuestion(i,x=>({...x,options:x.options.filter(y=>y.optionKey!==o.optionKey)}))}>删除选项</button>
          </div><div className="grid sm:grid-cols-2 gap-2 mt-2">
            {value.metrics.map(m=><label key={m.metricKey} className="text-sm">{m.label||m.metricKey} 权重
              <input className="input block w-full" type="number" value={o.contributions[m.metricKey]??0}
                onChange={e=>changeQuestion(i,x=>({...x,options:x.options.map(y=>y.optionKey===o.optionKey?
                  {...y,contributions:{...y.contributions,[m.metricKey]:Number(e.target.value)}}:y)}))}/></label>)}
          </div></div>)}
        <button type="button" className="btn-secondary" onClick={()=>changeQuestion(i,x=>({...x,options:[
          ...x.options,{optionKey:researchKey('o'),label:'新选项',contributions:newContributions()},
        ]}))}>增加选项</button>
      </article>)}
      {!value.questions.length&&<p className="text-sm text-slate-500">至少增加两个问题，每个选项对各构念的贡献可以不同，零权重也必须明确。</p>}
    </section>
  </div>
}
