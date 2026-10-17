import { useState } from 'react'
import type { SjtDraftV2, SjtQuestion, SjtScene } from './builder.types'
import { researchKey } from './builder.types'
import { SurveyImageField } from './SurveyImageField'

const reorder=<T,>(xs:T[],index:number,delta:number)=>{
  const next=[...xs];[next[index],next[index+delta]]=[next[index+delta],next[index]];return next
}
export function ResearchSjtV2Editor({value,onChange,projectId}:{value:SjtDraftV2;
  onChange:(next:SjtDraftV2)=>void;projectId:string}){
  const [selected,setSelected]=useState(value.scenes[0]?.sceneKey??'')
  const scene=value.scenes.find(s=>s.sceneKey===selected)??value.scenes[0]
  const contributions=():Record<string,number>=>({})
  const newQuestion=():SjtQuestion=>({questionKey:researchKey('q'),prompt:'',responseType:'SINGLE',
    required:true,allowRefusal:false,options:[1,2].map(i=>({optionKey:researchKey('o'),label:'选项 '+i,contributions:contributions()}))})
  const changeScene=(fn:(s:SjtScene)=>SjtScene)=>onChange({...value,scenes:value.scenes.map(s=>s.sceneKey===scene?.sceneKey?fn(s):s)})
  const changeQuestion=(key:string,fn:(q:SjtQuestion)=>SjtQuestion)=>changeScene(s=>({...s,questions:s.questions.map(q=>q.questionKey===key?fn(q):q)}))
  const mapOptions=(fn:(o:SjtQuestion['options'][number])=>SjtQuestion['options'][number])=>value.scenes.map(s=>({...s,questions:s.questions.map(q=>({...q,options:q.options.map(fn)}))}))
  const cloneQuestion=(q:SjtQuestion)=>{
    const keys=new Map(q.options.map(o=>[o.optionKey,researchKey('o')]))
    return {...structuredClone(q),questionKey:researchKey('q'),options:q.options.map(o=>({...structuredClone(o),optionKey:keys.get(o.optionKey)!})),
      ...(q.exclusiveOptionKeys?{exclusiveOptionKeys:q.exclusiveOptionKeys.map(k=>keys.get(k)!)}:{})}
  }
  const total=value.scenes.reduce((n,s)=>n+s.questions.length,0)
  return <div className="space-y-4">
    <section className="border rounded-xl p-4 space-y-3">
      <h3 className="font-semibold">情境测验 · 多情境固定顺序</h3>
      <p className="text-sm text-slate-600">每个情境独立编号；同一情境下的多道题只计为一个独立情境。最多 20 个情境、每个 10 题、合计 100 题。</p>
      <label className="block text-sm">适用人群／作答视角<select className="input block w-full" value={value.respondentType}
        onChange={e=>onChange({...value,respondentType:e.target.value as SjtDraftV2['respondentType']})}>
        <option value="participant_self_report">一般研究参与者自述</option><option value="student_self_report">学生视角（测量元数据）</option><option value="teacher_self_report">教师视角（测量元数据）</option>
      </select></label>
      <label className="block text-sm">测验标题<input className="input block w-full" value={value.title} onChange={e=>onChange({...value,title:e.target.value})}/></label>
      <label className="block text-sm">作者或授权来源<input className="input block w-full" value={value.author} onChange={e=>onChange({...value,author:e.target.value})}/></label>
      <label className="block text-sm">内容依据<textarea className="input block w-full" value={value.sourceNote} onChange={e=>onChange({...value,sourceNote:e.target.value})}/></label>
      <label className="block text-sm">材料权属<select className="input block w-full" value={value.licenseStatus}
        onChange={e=>onChange({...value,licenseStatus:e.target.value as SjtDraftV2['licenseStatus']})}>
        <option value="unknown">待确认，不能发布</option><option value="self_authored">研究者原创</option><option value="authorized">已获授权</option></select></label>
      <label className="block text-sm">研究展示许可<select className="input block w-full" value={value.redistribution}
        onChange={e=>onChange({...value,redistribution:e.target.value as SjtDraftV2['redistribution']})}>
        <option value="unknown">待核实</option><option value="restricted">限制展示，不能发布</option><option value="allowed">允许本研究展示</option></select></label>
    </section>
    <section className="border rounded-xl p-4 space-y-3" aria-label="维度与计分矩阵">
      <h3 className="font-semibold">维度与计分</h3>
      <label className="block text-sm">受控计分规则<select className="input block w-full" value={value.scoring.modelKey}
        onChange={e=>onChange({...value,scoring:{...value.scoring,modelKey:e.target.value as 'AUTHOR_KEY_SUM'|'EXPERT_KEY'}})}>
        <option value="AUTHOR_KEY_SUM">作者贡献：跨题求和</option><option value="EXPERT_KEY">专家评分键：跨题平均</option></select></label>
      <p className="text-xs text-slate-600">专家键指研究者提供的评分依据，不表示平台认证或效度验证。不自动合成跨维度总分。预览中的样例由服务器共用计分器计算。</p>
      <label className="block text-sm">{value.scoring.modelKey==='EXPERT_KEY'?'专家评分键来源（必填）':'计分依据说明'}
        <textarea className="input block w-full" value={value.scoring.sourceNote} onChange={e=>onChange({...value,scoring:{...value.scoring,sourceNote:e.target.value}})}/></label>
      {value.metrics.map((m,i)=><div key={m.metricKey} className="flex gap-2">
        <input className="input flex-1" aria-label={'构念 '+(i+1)} value={m.label} onChange={e=>onChange({...value,metrics:value.metrics.map(x=>x.metricKey===m.metricKey?{...x,label:e.target.value}:x)})}/>
        <button type="button" className="btn-secondary" onClick={()=>onChange({...value,metrics:value.metrics.filter(x=>x.metricKey!==m.metricKey),scenes:mapOptions(o=>{
          const next={...o.contributions};delete next[m.metricKey];return {...o,contributions:next}
        })})}>删除构念</button></div>)}
      <button type="button" className="btn-secondary" disabled={value.metrics.length>=20} onClick={()=>{
        const metricKey=researchKey('m');onChange({...value,metrics:[...value.metrics,{metricKey,label:'新构念',direction:'descriptive'}],
          scenes:value.scenes})
      }}>增加构念</button>
    </section>
    <div className="grid lg:grid-cols-[190px_minmax(0,1fr)] gap-4">
      <nav aria-label="情境列表" className="border rounded-xl p-3 space-y-2">
        {value.scenes.map((s,i)=><div key={s.sceneKey} className="border rounded p-2 space-y-2">
          <button type="button" aria-current={scene?.sceneKey===s.sceneKey?'step':undefined} className="text-left w-full font-medium" onClick={()=>setSelected(s.sceneKey)}>{i+1}. {s.title||'未命名情境'}</button>
          <div className="flex flex-wrap gap-2 text-xs">
            <button type="button" disabled={!i} onClick={()=>onChange({...value,scenes:reorder(value.scenes,i,-1)})}>上移</button>
            <button type="button" disabled={i===value.scenes.length-1} onClick={()=>onChange({...value,scenes:reorder(value.scenes,i,1)})}>下移</button>
            <button type="button" disabled={value.scenes.length>=20||total+s.questions.length>100} onClick={()=>{
              const copy={...structuredClone(s),sceneKey:researchKey('scene'),title:s.title+'（副本）',questions:s.questions.map(cloneQuestion)}
              onChange({...value,scenes:[...value.scenes,copy]});setSelected(copy.sceneKey)
            }}>复制情境</button>
            <button type="button" onClick={()=>onChange({...value,scenes:value.scenes.filter(x=>x.sceneKey!==s.sceneKey)})}>删除情境</button>
          </div></div>)}
        <button type="button" className="btn-secondary" disabled={value.scenes.length>=20||total>=100} onClick={()=>{
          const next={sceneKey:researchKey('scene'),title:'新情境',stimulus:'',questions:[newQuestion()]};onChange({...value,scenes:[...value.scenes,next]});setSelected(next.sceneKey)
        }}>增加情境</button>
      </nav>
      {scene&&<section className="border rounded-xl p-4 space-y-4" aria-label="当前情境编辑">
        <label className="block text-sm">情境标题<input className="input block w-full" value={scene.title} onChange={e=>changeScene(s=>({...s,title:e.target.value}))}/></label>
        <label className="block text-sm">情境材料<textarea className="input block w-full" rows={5} value={scene.stimulus} onChange={e=>changeScene(s=>({...s,stimulus:e.target.value}))}/></label>
        <SurveyImageField projectId={projectId} image={scene.image} onChange={image=>changeScene(s=>({...s,image}))}/>
        {scene.questions.map((q,i)=><article key={q.questionKey} id={'survey-sjt-'+q.questionKey} tabIndex={-1} className="border rounded-lg bg-slate-50 p-3 space-y-3">
          <div className="flex flex-wrap gap-3 items-center"><strong>问题 {i+1}</strong>
            <button type="button" disabled={!i} onClick={()=>changeScene(s=>({...s,questions:reorder(s.questions,i,-1)}))}>上移</button>
            <button type="button" disabled={i===scene.questions.length-1} onClick={()=>changeScene(s=>({...s,questions:reorder(s.questions,i,1)}))}>下移</button>
            <button type="button" disabled={scene.questions.length>=10||total>=100} onClick={()=>changeScene(s=>({...s,questions:[...s.questions,cloneQuestion(q)]}))}>复制问题</button>
            <button type="button" onClick={()=>changeScene(s=>({...s,questions:s.questions.filter(x=>x.questionKey!==q.questionKey)}))}>删除问题</button></div>
          <label className="block text-sm">题干<textarea className="input block w-full" value={q.prompt} onChange={e=>changeQuestion(q.questionKey,x=>({...x,prompt:e.target.value}))}/></label>
          <label className="block text-sm">作答方式<select className="input block w-full" value={q.responseType} onChange={e=>changeQuestion(q.questionKey,x=>({...x,responseType:e.target.value as 'SINGLE'|'MULTIPLE',
            aggregationPolicy:undefined,minSelections:e.target.value==='MULTIPLE'?1:undefined,maxSelections:e.target.value==='MULTIPLE'?2:undefined,exclusiveOptionKeys:undefined}))}>
            <option value="SINGLE">单选</option><option value="MULTIPLE">受限多选</option></select></label>
          <label className="text-sm mr-4"><input type="checkbox" checked={q.required} onChange={e=>changeQuestion(q.questionKey,x=>({...x,required:e.target.checked}))}/> 必答</label>
          <label className="text-sm"><input type="checkbox" checked={q.allowRefusal} onChange={e=>changeQuestion(q.questionKey,x=>({...x,allowRefusal:e.target.checked}))}/> 允许明确拒答</label>
          {q.responseType==='MULTIPLE'&&<div className="grid sm:grid-cols-3 gap-2">
            <label className="text-sm">最少选择<input className="input block w-full" type="number" min={1} max={6} value={q.minSelections??1} onChange={e=>changeQuestion(q.questionKey,x=>({...x,minSelections:Number(e.target.value)}))}/></label>
            <label className="text-sm">最多选择<input className="input block w-full" type="number" min={1} max={6} value={q.maxSelections??2} onChange={e=>changeQuestion(q.questionKey,x=>({...x,maxSelections:Number(e.target.value)}))}/></label>
            <label className="text-sm">多选聚合<select className="input block w-full" value={q.aggregationPolicy??''} onChange={e=>changeQuestion(q.questionKey,x=>({...x,aggregationPolicy:e.target.value as 'SUM'|'MEAN'}))}>
              <option value="">请选择</option><option value="SUM">所选贡献求和</option><option value="MEAN">所选贡献平均</option></select></label>
            <p className="text-xs sm:col-span-3">最多 6 个选项、24 个合法组合；拒答／无法判断独占选择，不计零分。</p>
          </div>}
          <button type="button" className="btn-secondary" onClick={()=>changeQuestion(q.questionKey,x=>({...x,options:x.options.map(o=>o.nonanswerReason?o:{...o,contributions:Object.fromEntries(value.metrics.map(m=>[m.metricKey,o.contributions[m.metricKey]??0]))})}))}>确认本题未填贡献均为零</button>
          <div className="overflow-x-auto"><table className="w-full text-sm border-collapse"><caption className="text-left font-medium">选项 × 构念贡献矩阵（零为明确零贡献）</caption>
            <thead><tr><th scope="col">选项与缺失规则</th>{value.metrics.map(m=><th key={m.metricKey} scope="col">{m.label}</th>)}<th scope="col">操作</th></tr></thead>
            <tbody>{q.options.map((o,j)=><tr key={o.optionKey}>
              <td className="p-2 min-w-44"><input className="input w-full" aria-label={'问题 '+(i+1)+' 选项 '+(j+1)} value={o.label} onChange={e=>changeQuestion(q.questionKey,x=>({...x,options:x.options.map(y=>y.optionKey===o.optionKey?{...y,label:e.target.value}:y)}))}/>
                <select className="input mt-1 w-full" aria-label={'选项 '+(j+1)+' 计分用途'} value={o.nonanswerReason??'SCORED'} onChange={e=>changeQuestion(q.questionKey,x=>({...x,options:x.options.map(y=>y.optionKey===o.optionKey?
                  {...y,nonanswerReason:e.target.value==='SCORED'?undefined:e.target.value as 'DECLINED'|'UNABLE_TO_JUDGE',contributions:e.target.value==='SCORED'?contributions():{}}:y)}))}>
                  <option value="SCORED">参与计分</option><option value="DECLINED">选择不回答</option><option value="UNABLE_TO_JUDGE">无法判断／不适用</option></select>
                {q.responseType==='MULTIPLE'&&!o.nonanswerReason&&<label className="block text-xs mt-1"><input type="checkbox" checked={q.exclusiveOptionKeys?.includes(o.optionKey)??false} onChange={e=>changeQuestion(q.questionKey,x=>({...x,exclusiveOptionKeys:e.target.checked?[...(x.exclusiveOptionKeys??[]),o.optionKey]:(x.exclusiveOptionKeys??[]).filter(k=>k!==o.optionKey)}))}/> 与其他选项互斥</label>}
              </td>{value.metrics.map(m=><td key={m.metricKey} className="p-1 min-w-24">{o.nonanswerReason?'不计分':<input className="input w-full" type="number" step="any" aria-label={'问题 '+(i+1)+' 选项 '+(j+1)+' '+m.label+' 贡献'} value={o.contributions[m.metricKey]??''}
                onChange={e=>changeQuestion(q.questionKey,x=>({...x,options:x.options.map(y=>y.optionKey===o.optionKey?{...y,contributions:e.target.value===''?Object.fromEntries(Object.entries(y.contributions).filter(([key])=>key!==m.metricKey)):{...y.contributions,[m.metricKey]:Number(e.target.value)}}:y)}))}/>}</td>)}
              <td><button type="button" className="btn-secondary" onClick={()=>changeQuestion(q.questionKey,x=>({...x,options:x.options.filter(y=>y.optionKey!==o.optionKey),exclusiveOptionKeys:x.exclusiveOptionKeys?.filter(k=>k!==o.optionKey)}))}>删除选项</button></td>
            </tr>)}</tbody></table></div>
          <button type="button" className="btn-secondary" disabled={q.options.length>=(q.responseType==='MULTIPLE'?6:12)} onClick={()=>changeQuestion(q.questionKey,x=>({...x,options:[...x.options,{optionKey:researchKey('o'),label:'新选项',contributions:contributions()}]}))}>增加选项</button>
        </article>)}
        <button type="button" className="btn-secondary" disabled={scene.questions.length>=10||total>=100} onClick={()=>changeScene(s=>({...s,questions:[...s.questions,newQuestion()]}))}>增加问题</button>
      </section>}
    </div>
  </div>
}
