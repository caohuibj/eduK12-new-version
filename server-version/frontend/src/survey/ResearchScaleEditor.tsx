import {SurveyMaterialPicker} from './SurveyMaterialPicker'
import {scoreSelectionSummary} from '../modules/assessment-core/scale/scoreSummary'
import {useEffect,useId,useState} from 'react'
import {Settings2,ListChecks,ListOrdered,SlidersHorizontal,MessageSquare,Plus,ArrowUp,ArrowDown,Copy,Trash2} from 'lucide-react'
import {applyScaleOptionLabels,parseScaleItemPaste,scaleOptionPresets} from '../modules/assessment-core/scale/authoringInput'
import {validateRawScoreFeedback} from '../modules/scale/rawScoreFeedback'
import './survey-scale-studio.css'
import { SurveyRawScoreFeedbackEditor } from './SurveyRawScoreFeedbackEditor'
import type { ScaleDraft } from './builder.types'
import { researchKey } from './builder.types'
type ScaleSection='basic'|'responses'|'items'|'scores'|'report'
const scaleSections=[{key:'basic',label:'基本设置',Icon:Settings2},{key:'responses',label:'响应选项',Icon:ListChecks},{key:'items',label:'题目',Icon:ListOrdered},{key:'scores',label:'计分',Icon:SlidersHorizontal},{key:'report',label:'报告反馈',Icon:MessageSquare}] as const
export function ResearchScaleEditor({value,onChange,projectId,appearance='standard',onDraftRiskChange,onSave,canSave=false,disabled=false}:{value:ScaleDraft;onChange:(next:ScaleDraft)=>void;projectId?:string;appearance?:'standard'|'studio';onDraftRiskChange?:(dirty:boolean)=>void;onSave?:()=>void;canSave?:boolean;disabled?:boolean}){
  const studio=appearance==='studio',uid=useId()
  const [active,setActive]=useState<ScaleSection>('basic'),[optionPaste,setOptionPaste]=useState(''),[itemPaste,setItemPaste]=useState(''),[inputError,setInputError]=useState(''),[inputNotice,setInputNotice]=useState('')
  const pendingPaste=!!optionPaste.trim()||!!itemPaste.trim()
  useEffect(()=>{onDraftRiskChange?.(pendingPaste);return()=>onDraftRiskChange?.(false)},[pendingPaste,onDraftRiskChange])
  const setItem=(index:number,fn:(item:ScaleDraft['items'][number])=>ScaleDraft['items'][number])=>
    onChange({...value,items:value.items.map((x,i)=>i===index?fn(x):x)})
  const applyOptions=(text:string)=>{
    try{
      const count=text.split(/\r\n?|\n/).filter(line=>line.trim()).length;if(count<2||count>15)throw new Error('请每行填写一个选项，Survey 量表支持 2–15 项，最多支持 15 个响应选项。')
      const options=applyScaleOptionLabels(value.responseOptions.map(o=>({value:o.optionKey,label:o.label,score:o.score})),text)
      onChange({...value,responseOptions:options.map(o=>({optionKey:String(o.value),label:o.label,score:o.score}))});setOptionPaste('');setInputError('');setInputNotice('选项文字已应用；同序选项的分值与标识保留，请核对后保存量表。')
    }catch(cause){setInputError(cause instanceof Error?cause.message:'选项内容无效');setInputNotice('')}
  }
  const appendItems=()=>{
    try{const rows=parseScaleItemPaste(itemPaste);if(!rows.length)return;if(value.items.length+rows.length>240)throw new Error('量表题目总数不能超过 240 道。')
      onChange({...value,items:[...value.items,...rows.map(row=>({itemKey:researchKey('q'),prompt:row.content,required:true,reverse:row.reverse,dimensionKeys:value.dimensions.length?[value.dimensions[0].dimensionKey]:[]}))]});setItemPaste('');setInputError('');setInputNotice('已追加 '+rows.length+' 道题目，请在“计分”中核对维度归属，然后保存量表。')
    }catch(cause){setInputError(cause instanceof Error?cause.message:'题目内容无效');setInputNotice('')}
  }
  const newItem=(purpose:'CONTENT'|'ATTENTION_CHECK'|'SOCIAL_DESIRABILITY'='CONTENT')=>onChange({...value,items:[...value.items,{itemKey:researchKey('q'),prompt:'',required:true,reverse:false,dimensionKeys:purpose==='CONTENT'&&value.dimensions.length?[value.dimensions[0].dimensionKey]:[],...(purpose!=='CONTENT'?{purpose}:{})}]})
  const basic=<section className="border rounded-xl p-4 space-y-3 bg-white">
      <header className={studio?'survey-scale-panel-heading':undefined}><div><h3 className="font-semibold">{studio?'题目呈现方式':'施测呈现方式（随冻结 Publication 固定）'}</h3>{studio&&<p>选择被试如何浏览整份量表。</p>}</div></header>
      <label className="block text-sm">题目呈现
        <select className="input block w-full" aria-label="量表施测呈现模式"
          value={value.presentationMode??'ALL_AT_ONCE'}
          onChange={e=>onChange({...value,
            presentationMode:e.target.value as 'ONE_BY_ONE'|'ALL_AT_ONCE'})}>
          <option value="ONE_BY_ONE">逐题呈现 · 记录浏览器逐题时间</option>
          <option value="ALL_AT_ONCE">整份呈现 · 不推定逐题反应时间</option>
        </select>
      </label>
      {studio?<details className="survey-scale-help"><summary>呈现方式与版本说明</summary><p>逐题呈现可记录浏览器逐题时间；整份呈现不推定逐题反应时间。新建量表默认逐题，未声明方式的历史版本按整份呈现。发布后方式随该版本固定，修改可能影响不同时间点结果的可比性。</p></details>:<p className="text-xs text-slate-600">新建量表默认逐题；此前未声明的历史草稿和已冻结量表仍按整份呈现。改变模式将生成新的冻结来源版本，可能影响纵向可比性。</p>}
    </section>
  const responses=<section className="border rounded-xl p-4 space-y-3 bg-white">
      <header className={studio?'survey-scale-panel-heading':undefined}><div><h3 className="font-semibold">{studio?'作答选项':'量表响应选项（共享选项组）'}</h3>{studio&&<p>同一组选项供量表题目共用；文字显示给被试，分值用于计分。</p>}</div>{studio&&<span>{value.responseOptions.length} / 15 项</span>}</header>
      {studio&&<div className="survey-scale-option-tools"><div className="survey-scale-presets"><span>常用选项</span>{scaleOptionPresets.map(preset=><button type="button" key={preset.label} onClick={()=>{setOptionPaste(preset.labels.join('\n'));applyOptions(preset.labels.join('\n'))}}>{preset.label}</button>)}</div><details className="survey-scale-help"><summary>批量粘贴选项</summary><label>每行一个选项<textarea className="input" aria-label="选项批量内容" rows={4} value={optionPaste} maxLength={20000} onChange={event=>setOptionPaste(event.target.value)} placeholder={'非常不同意\n不同意\n一般\n同意\n非常同意'}/></label><p>保留同序选项的分值与标识；缩减选项前，请核对注意力题的目标选项。</p><button type="button" className="btn-secondary" disabled={!optionPaste.trim()} onClick={()=>applyOptions(optionPaste)}>应用选项文字</button></details></div>}
      {studio&&<div className="survey-scale-option-columns" aria-hidden="true"><span>#</span><span>选项文字</span><span>分值</span><span/></div>}
      <div className={studio?'survey-scale-option-list':'grid sm:grid-cols-2 gap-3'}>
        {value.responseOptions.map((option,i)=><div className={studio?'survey-scale-option-row':'flex gap-2 items-center'} key={option.optionKey}>
          {studio&&<span className="survey-scale-row-number">{i+1}</span>}<label className={!studio?'contents':undefined}>{studio&&<span className="sr-only">选项文字</span>}<input className="input w-full" aria-label={'响应选项 '+(i+1)} value={option.label}
            onChange={e=>onChange({...value,responseOptions:value.responseOptions.map(x=>x.optionKey===option.optionKey?{...x,label:e.target.value}:x)})}/></label>
          <label className={!studio?'contents':undefined}>{studio&&<span className="sr-only">分值</span>}<input className="input w-20" aria-label={'计分 '+(i+1)} type="number" value={option.score}
            onChange={e=>onChange({...value,responseOptions:value.responseOptions.map(x=>x.optionKey===option.optionKey?{...x,score:Number(e.target.value)}:x)})}/></label>
          <button type="button" className="btn-secondary" aria-label={studio?'删除响应选项 '+(i+1):undefined} onClick={()=>onChange({...value,responseOptions:value.responseOptions.filter(x=>x.optionKey!==option.optionKey)})}>{studio?<Trash2 size={16}/>: '删除'}</button>
        </div>)}</div>
      <button type="button" className="btn-secondary" disabled={studio&&value.responseOptions.length>=15} onClick={()=>onChange({...value,responseOptions:[...value.responseOptions,{optionKey:researchKey('o'),label:'新选项',score:value.responseOptions.length+1}]})}>{studio&&<Plus size={16}/>}新增选项</button>
    </section>
  const selectionSummary=(keys:string[],aggregation:'sum'|'mean')=>scoreSelectionSummary({items:value.items.filter(item=>!item.purpose||item.purpose==='CONTENT').map(item=>({key:item.itemKey,scores:value.responseOptions.map(option=>option.score)})),selected:keys.map(key=>({key})),aggregation})
  const dimensions=<section className="border rounded-xl p-4 space-y-3 bg-white">
      <header className={studio?'survey-scale-panel-heading':undefined}><div><h3 className="font-semibold">{studio?'维度计分':'维度（研究描述性得分，不提供常模）'}</h3>{studio&&<p>设置维度名称、分数含义及纳入的内容题，不提供常模或诊断。</p>}</div>{studio&&<span>{value.dimensions.length} / 20 个维度</span>}</header>
      {studio&&!value.dimensions.length&&<p className="survey-scale-empty">还没有维度。先新增一个维度，再选择参与计分的题目。</p>}
      {value.dimensions.map((dim,i)=><div className={studio?'survey-scale-score-card':'survey-scale-dimension flex flex-wrap items-center gap-3'} key={dim.dimensionKey}>
        <div className={studio?'survey-scale-score-fields':'contents'}><label className={!studio?'contents':undefined}>{studio&&'维度名称'}<input className="input flex-1" aria-label={'维度 '+(i+1)} value={dim.label}
          onChange={e=>onChange({...value,dimensions:value.dimensions.map(x=>x.dimensionKey===dim.dimensionKey?{...x,label:e.target.value}:x)})}/></label>
        <label className={!studio?'contents':undefined}>{studio&&'分数方向'}<select className="input" aria-label={'维度方向 '+(i+1)} value={dim.direction}
          onChange={e=>onChange({...value,dimensions:value.dimensions.map(x=>
            x.dimensionKey===dim.dimensionKey?{...x,direction:e.target.value as ScaleDraft['dimensions'][number]['direction']}:x)})}>
          <option value="descriptive">仅描述</option>
          <option value="higher_is_more">越高代表越多</option>
          <option value="higher_is_better">越高越好（研究性定义）</option>
          <option value="higher_is_worse">越高越差（研究性定义）</option>
          <option value="bipolar">双极方向</option>
        </select></label>
        <button type="button" className="btn-secondary" aria-label={studio?'删除维度 '+(i+1):undefined} onClick={()=>onChange({...value,
          dimensions:value.dimensions.filter(x=>x.dimensionKey!==dim.dimensionKey),
          items:value.items.map(x=>({...x,dimensionKeys:x.dimensionKeys.filter(k=>k!==dim.dimensionKey)}))})}>删除</button>
        </div>
        <p className="text-sm text-slate-600" role="status">{selectionSummary(value.items.filter(item=>item.dimensionKeys.includes(dim.dimensionKey)).map(item=>item.itemKey),value.aggregation)}</p>
        {studio&&<fieldset className="survey-scale-score-members"><legend>纳入计分的题目 <small>{value.items.filter(q=>(!q.purpose||q.purpose==='CONTENT')&&q.dimensionKeys.includes(dim.dimensionKey)).length} 题</small></legend><div>{value.items.map((q,qi)=>(!q.purpose||q.purpose==='CONTENT')&&<label key={q.itemKey} className={q.dimensionKeys.includes(dim.dimensionKey)?'is-selected':''}><input type="checkbox" aria-label={dim.label+' 纳入第 '+(qi+1)+' 题'} checked={q.dimensionKeys.includes(dim.dimensionKey)} onChange={event=>setItem(qi,item=>({...item,dimensionKeys:event.target.checked?[...item.dimensionKeys,dim.dimensionKey]:item.dimensionKeys.filter(key=>key!==dim.dimensionKey)}))}/><span>第 {qi+1} 题</span><small title={q.prompt}>{q.prompt||'未填写题干'}</small></label>)}</div>{!value.items.some(q=>!q.purpose||q.purpose==='CONTENT')&&<p>先到“题目”分区添加内容题；辅助题不参与计分。</p>}</fieldset>}
      </div>)}
      <button type="button" className="btn-secondary" disabled={studio&&value.dimensions.length>=20} onClick={()=>onChange({...value,dimensions:[
        ...value.dimensions,{dimensionKey:researchKey('d'),label:'新维度',direction:'descriptive'},
      ]})}>新增维度</button>
      <label className={studio?'survey-scale-aggregation':'block text-sm'}>{studio?'维度计分方式':'维度聚合'}
        <select className="input block" value={value.aggregation} onChange={e=>onChange({...value,aggregation:e.target.value as ScaleDraft['aggregation']})}>
          <option value="mean">平均分</option><option value="sum">总分</option>
        </select>{studio&&<small>平均分：分值相加后除以题目数；总分：分值直接相加。适用于上方所有维度。</small>}</label>
    </section>
  const items=<section className="border rounded-xl p-4 space-y-3 bg-white">
      <header className={studio?'survey-scale-panel-heading':'flex justify-between'}><div><h3 className="font-semibold">{studio?'题目录入':'量表题目'}</h3>{studio&&<p>共 {value.items.length} / 240 题。新增内容题默认必答、正向计分，并加入首个维度；可在“计分”中调整。</p>}</div>
        <button type="button" className="btn-secondary" disabled={studio&&value.items.length>=240} onClick={()=>newItem()}>{studio&&<Plus size={16}/>} {studio?'增加题目':'增加 Likert 题目'}</button></header>
      {studio&&<details className="survey-scale-bulk"><summary>批量录入与辅助题</summary><label>粘贴题干<textarea className="input" aria-label="题干批量内容" rows={5} maxLength={200000} value={itemPaste} onChange={event=>setItemPaste(event.target.value)} placeholder={'每行一道题，例如：\n我能专心完成学习任务\n我常常中途放弃 [反向]'}/></label><div className="survey-scale-bulk-footer"><p>每行一道题，首尾的 [反向] 或 (R) 标记会转为反向计分；一次最多 200 题。</p><button type="button" className="btn-secondary" disabled={!itemPaste.trim()||value.items.length>=240} onClick={appendItems}>追加题目</button></div><div className="survey-scale-assist"><button type="button" className="btn-secondary" disabled={value.items.length>=240} onClick={()=>newItem('ATTENTION_CHECK')}>插入注意力题</button><button type="button" className="btn-secondary" disabled={value.items.length>=240} onClick={()=>newItem('SOCIAL_DESIRABILITY')}>插入社会赞许性题</button><p>辅助题仅采集和导出，不纳入维度、总分或系统内质量判断。</p></div></details>}
      {studio&&!value.items.length&&<div className="survey-scale-empty">还没有题目。可以逐题添加，也可以展开上方批量录入。</div>}
      {value.items.map((q,i)=>{const settings=<><label className="block text-sm">题目用途
          <select className="input block w-full" aria-label={'题目用途 '+(i+1)} value={q.purpose??'CONTENT'} onChange={e=>{
            const purpose=e.target.value as NonNullable<typeof q.purpose>
            onChange({...value,items:value.items.map((x,k)=>k===i?{...x,purpose,attentionTarget:undefined,...(purpose!=='CONTENT'?{reverse:false,dimensionKeys:[]}: {})}:x),
              totalScore:value.totalScore&&purpose!=='CONTENT'?{...value.totalScore,itemKeys:value.totalScore.itemKeys.filter(key=>key!==q.itemKey)}:value.totalScore})
          }}><option value="CONTENT">内容题（计分）</option><option value="UNSCORED">不计分附加题</option><option value="ATTENTION_CHECK">注意力题（仅采集）</option><option value="SOCIAL_DESIRABILITY">社会赞许题／测谎题（仅采集）</option></select>
        </label>
        {q.purpose==='ATTENTION_CHECK'&&<label className="block text-sm">作者设定的目标选项
          <select className="input block w-full" aria-label={'目标选项 '+(i+1)} value={q.attentionTarget??''} onChange={e=>setItem(i,x=>({...x,attentionTarget:e.target.value||undefined}))}>
            <option value="">请选择</option>{value.responseOptions.map(o=><option key={o.optionKey} value={o.optionKey}>{o.label}</option>)}
          </select></label>}
        {q.purpose&&q.purpose!=='CONTENT'&&<p className="text-xs text-slate-600">沿用共享 Likert 选项；不计入维度或总分，不反向计分。仅导出作答供研究者分析，不在系统内判定通过、失败或说谎。</p>}</>;return <article className={studio?'survey-scale-item-card':'border bg-slate-50 rounded-lg p-3 space-y-3 scroll-mt-4'}
          id={'survey-scale-'+q.itemKey} tabIndex={-1} key={q.itemKey}>
        <div className={studio?'survey-scale-item-heading':'flex gap-2 items-center'}><strong className="text-sm">{studio?'第 '+(i+1)+' 题':'题 '+(i+1)}</strong>{studio&&<span>{q.required?'必答':'选答'} · {q.purpose==='ATTENTION_CHECK'?'注意力题':q.purpose==='SOCIAL_DESIRABILITY'?'社会赞许性题':q.purpose==='UNSCORED'?'不计分附加题':'内容题'}</span>}<div className={studio?'survey-scale-item-actions':'contents'}>
          <button type="button" className="btn-secondary" aria-label={'上移第 '+(i+1)+' 题'} disabled={i===0}
            onClick={()=>{const items=value.items.slice();[items[i],items[i-1]]=[items[i-1],items[i]];onChange({...value,items})}}>{studio?<ArrowUp size={16}/>: '↑'}</button>
          <button type="button" className="btn-secondary" aria-label={'下移第 '+(i+1)+' 题'} disabled={i===value.items.length-1}
            onClick={()=>{const items=value.items.slice();[items[i],items[i+1]]=[items[i+1],items[i]];onChange({...value,items})}}>{studio?<ArrowDown size={16}/>: '↓'}</button>
          <button type="button" className="btn-secondary" aria-label={'复制第 '+(i+1)+' 题'} disabled={studio&&value.items.length>=240} onClick={()=>onChange({...value,items:[
            ...value.items.slice(0,i+1),{...q,itemKey:researchKey('q'),dimensionKeys:[...q.dimensionKeys]},...value.items.slice(i+1)]})}>{studio?<Copy size={16}/>: '复制'}</button>
          <button type="button" className="btn-secondary" aria-label={'删除第 '+(i+1)+' 题'} onClick={()=>onChange({...value,items:value.items.filter((_,k)=>k!==i),totalScore:value.totalScore?{...value.totalScore,itemKeys:value.totalScore.itemKeys.filter(k=>k!==q.itemKey)}:undefined})}>{studio?<Trash2 size={16}/>: '删除'}</button>
        </div></div>
        {!studio&&settings}
        <textarea className="input w-full" rows={2} aria-label={'题干 '+(i+1)} value={q.prompt}
          onChange={e=>setItem(i,x=>({...x,prompt:e.target.value}))}/>
        <details className="survey-scale-item-details survey-scale-item-materials"><summary>题目素材 · 图片、视频、文档</summary><SurveyMaterialPicker label="题目展示素材" value={q.materials} onChange={materials=>setItem(i,item=>({...item,materials}))}/></details>
        {studio&&<details className="survey-scale-item-details"><summary>题目用途与辅助题设置</summary>{settings}</details>}
        {(!q.purpose||q.purpose==='CONTENT')&&<><label className="inline-flex gap-2 items-center"><input type="checkbox" checked={q.reverse}
          onChange={e=>setItem(i,x=>({...x,reverse:e.target.checked}))}/>反向计分</label>
        <fieldset hidden={studio} className="flex flex-wrap gap-3 text-sm"><legend className="font-semibold">所属维度</legend>
          {value.dimensions.map(dim=><label key={dim.dimensionKey} className="inline-flex gap-1 items-center">
            <input type="checkbox" checked={q.dimensionKeys.includes(dim.dimensionKey)}
              onChange={e=>setItem(i,x=>({...x,dimensionKeys:e.target.checked?
                [...x.dimensionKeys,dim.dimensionKey]:x.dimensionKeys.filter(k=>k!==dim.dimensionKey)}))}/>
            {dim.label||dim.dimensionKey}</label>)}
        </fieldset>{studio&&<div className="survey-scale-item-score-note"><span>所属维度：{value.dimensions.filter(d=>q.dimensionKeys.includes(d.dimensionKey)).map(d=>d.label).join('、')||'尚未设置'}</span><button type="button" onClick={()=>setActive('scores')}>设置计分 →</button></div>}</>}
      </article>})}
    </section>
  const total=<section className="border rounded-xl p-4 space-y-3 bg-white">
      <header className={studio?'survey-scale-panel-heading':undefined}><div><h3 className="font-semibold">研究总分（可选）</h3>{studio&&<p>总分独立于维度分，只纳入你明确选择的内容题。</p>}</div></header>
      <label className="inline-flex gap-2"><input type="checkbox" checked={!!value.totalScore} onChange={e=>onChange({...value,totalScore:e.target.checked?{key:'total',label:'总分',aggregation:'sum',itemKeys:value.items.filter(q=>!q.purpose||q.purpose==='CONTENT').map(q=>q.itemKey)}:undefined})}/>启用独立总分</label>
      {value.totalScore&&<>
        <label className="block text-sm">总分标识<input className="input block" value={value.totalScore.key} onChange={e=>onChange({...value,totalScore:{...value.totalScore!,key:e.target.value}})}/></label>
        <label className="block text-sm">总分名称<input className="input block" value={value.totalScore.label} onChange={e=>onChange({...value,totalScore:{...value.totalScore!,label:e.target.value}})}/></label>
        <label className="block text-sm">总分聚合<select className="input block" value={value.totalScore.aggregation} onChange={e=>onChange({...value,totalScore:{...value.totalScore!,aggregation:e.target.value as 'sum'|'mean'}})}><option value="sum">求和</option><option value="mean">平均</option></select></label>
        <p className="text-sm text-slate-600" role="status">{selectionSummary(value.totalScore.itemKeys,value.totalScore.aggregation)}</p>
        <fieldset className={studio?'survey-scale-total-members':'space-y-2'}><legend className="text-sm font-semibold">纳入总分的内容题</legend>{value.items.filter(q=>!q.purpose||q.purpose==='CONTENT').map(q=><label className="flex gap-2 text-sm" key={q.itemKey}><input type="checkbox" checked={value.totalScore!.itemKeys.includes(q.itemKey)} onChange={e=>onChange({...value,totalScore:{...value.totalScore!,itemKeys:e.target.checked?[...value.totalScore!.itemKeys,q.itemKey]:value.totalScore!.itemKeys.filter(k=>k!==q.itemKey)}})}/>{q.prompt||q.itemKey}</label>)}</fieldset>
      </>}
    </section>
  const feedback=<SurveyRawScoreFeedbackEditor value={value} onChange={onChange} projectId={projectId} compact={studio}/>
  if(!studio)return <div className="space-y-5">{basic}{responses}{dimensions}{items}{total}{feedback}</div>
  const counts={basic:null,responses:value.responseOptions.length,items:value.items.length,scores:value.dimensions.length+(value.totalScore?1:0),report:value.rawScoreFeedback?.rules.length??0}
  const feedbackIssues=validateRawScoreFeedback(value.rawScoreFeedback,[...value.dimensions.map(d=>d.dimensionKey),...(value.totalScore?[value.totalScore.key]:[])])
  return <div className="survey-scale-studio">
    <div className="survey-scale-navigation" role="tablist" aria-label="量表编制分区">{scaleSections.map(({key,label,Icon},index)=><button type="button" key={key} role="tab" aria-label={label} aria-selected={active===key} aria-controls={uid+'-'+key} id={uid+'-tab-'+key} tabIndex={active===key?0:-1} onClick={()=>{setActive(key);setInputError('');setInputNotice('')}} onKeyDown={event=>{const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;if(!offset&&event.key!=='Home'&&event.key!=='End')return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?scaleSections.length-1:(index+offset+scaleSections.length)%scaleSections.length;setActive(scaleSections[next].key);setInputError('');setInputNotice('');event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus()}}><Icon size={17} aria-hidden="true"/><span>{label}</span>{counts[key]!==null&&<small aria-hidden="true">{counts[key]}</small>}{key==='report'&&feedbackIssues.length>0&&<span className="survey-scale-error-dot" title="反馈设置有待修正内容" aria-hidden="true"/>}</button>)}</div>
    {inputError&&<p role="alert" className="survey-scale-input-message is-error">{inputError}</p>}{inputNotice&&<p role="status" className="survey-scale-input-message">{inputNotice}</p>}
    <div id={uid+'-basic'} role="tabpanel" aria-labelledby={uid+'-tab-basic'} hidden={active!=='basic'}><fieldset disabled={disabled} className="survey-scale-panel-content">{basic}</fieldset></div>
    <div id={uid+'-responses'} role="tabpanel" aria-labelledby={uid+'-tab-responses'} hidden={active!=='responses'}><fieldset disabled={disabled} className="survey-scale-panel-content">{responses}</fieldset></div>
    <div id={uid+'-items'} role="tabpanel" aria-labelledby={uid+'-tab-items'} hidden={active!=='items'}><fieldset disabled={disabled} className="survey-scale-panel-content">{items}</fieldset></div>
    <div id={uid+'-scores'} role="tabpanel" aria-labelledby={uid+'-tab-scores'} hidden={active!=='scores'}><fieldset disabled={disabled} className="survey-scale-panel-content">{dimensions}{total}</fieldset></div>
    <div id={uid+'-report'} role="tabpanel" aria-labelledby={uid+'-tab-report'} hidden={active!=='report'}><fieldset disabled={disabled} className="survey-scale-panel-content">{feedback}</fieldset></div>
    <footer className="survey-scale-save-footer"><span className="survey-scale-save-hint">{pendingPaste?'有尚未应用的批量内容，请先应用或清空，再保存量表。':'切换分区保留本页编辑；保存会一并保存所有分区的修改。'}</span>{onSave&&<button type="button" className="btn-primary" disabled={disabled||!canSave||pendingPaste} onClick={onSave}>保存当前草稿</button>}</footer>
  </div>
}
