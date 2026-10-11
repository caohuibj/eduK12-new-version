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
      <p className="text-xs text-slate-600">当前使用原有 SJT 编译器的学生/教师单选执行契约。多选与其他研究对象的自编 SJT 尚不支持发布，不能以不同对象身份代替。</p>
      <h4 className="font-semibold text-sm">内容来源、研究展示许可</h4>
      <label className="block text-sm">作者或授权来源
        <input className="input block w-full" value={value.author}
          onChange={e=>onChange({...value,author:e.target.value})}/></label>
      <label className="block text-sm">原创/授权依据记录（不放入被试报告）
        <textarea className="input block w-full" rows={2} value={value.sourceNote}
          onChange={e=>onChange({...value,sourceNote:e.target.value})}/></label>
      <label className="block text-sm">权属声明
        <select className="input block w-full" value={value.licenseStatus??'unknown'}
          onChange={e=>onChange({...value,licenseStatus:e.target.value as SjtDraft['licenseStatus']})}>
          <option value="unknown">尚未确认，不允许冻结发布</option>
          <option value="self_authored">研究者原创</option>
          <option value="authorized">已取得明确授权</option>
        </select></label>
      <label className="block text-sm">研究链接中的展示与分发权
        <select className="input block w-full" value={value.redistribution}
          onChange={e=>onChange({...value,redistribution:e.target.value as SjtDraft['redistribution']})}>
          <option value="unknown">尚未核实</option>
          <option value="restricted">限制展示，不允许公开研究发布</option>
          <option value="allowed">已授权在本研究中展示</option>
        </select></label>
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
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="text-sm">作答方式
            <select className="input block w-full" value={q.responseType??'SINGLE'}
              onChange={e=>changeQuestion(i,x=>({
                ...x,
                responseType:e.target.value as 'SINGLE'|'MULTIPLE',
                minSelections:e.target.value==='MULTIPLE'?1:undefined,
                maxSelections:e.target.value==='MULTIPLE'?Math.min(2,x.options.length):undefined,
              }))}>
              <option value="SINGLE">单选（正式核心单选执行）</option>
              <option value="MULTIPLE">多选（研究专用受控组合编译）</option>
            </select></label>
          {q.responseType==='MULTIPLE'&&<>
            <label className="text-sm">最少选择
              <input className="input block w-full" type="number" min={1} max={6}
                value={q.minSelections??1}
                onChange={e=>changeQuestion(i,x=>({...x,minSelections:Number(e.target.value)}))}/>
            </label>
            <label className="text-sm">最多选择
              <input className="input block w-full" type="number" min={1} max={6}
                value={q.maxSelections??2}
                onChange={e=>changeQuestion(i,x=>({...x,maxSelections:Number(e.target.value)}))}/>
            </label>
          </>}
        </div>
        {q.responseType==='MULTIPLE'&&<p className="text-xs text-slate-600">
          每个选项可同时贡献多个构念。系统只编译不超过 24 个合法选择组合，
          根据所选原选项的贡献求和，再交由既有 SJT AUTHOR_KEY_SUM 评分模型处理；
          超出上限会阻止正式发布，不修改历史评分算法。</p>}
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
