import { researchKey } from './builder.types'
import type { FlowBlock,FlowDraft,FlowField,FlowCondition } from './flow.client'

export type ToolInfo={id:string;instrumentKey:string;title:string;kind:string}
export type FormQuestionInfo={instrumentKey:string;itemKey:string;prompt:string;type:string;
  options:{optionKey:string;label:string}[]}
type FieldChoice={id:string;label:string;field:FlowField;
  kind:'choice'|'choices'|'number'|'text'|'boolean';options:{key:string;label:string}[]}
const defaultValue=(field:FieldChoice)=>field.kind==='number'?0:field.kind==='boolean'?true:
  field.options[0]?.key??''
const defaultPredicate=(fields:FieldChoice[]):FlowCondition=>({
  op:fields[0]?.kind==='choices'?'INCLUDES':'EQUALS',field:fields[0]?.field??{source:'EMBEDDED',key:'placeholder'},
  value:fields[0]?defaultValue(fields[0]):'',
})
const itemField=(x:FormQuestionInfo):FieldChoice|null=>{
  const kind:FieldChoice['kind']|null=['SINGLE','LIKERT'].includes(x.type)?'choice':
    x.type==='MULTIPLE'?'choices':['NUMBER','SLIDER'].includes(x.type)?'number':
    ['SHORT_TEXT','LONG_TEXT','DATE','TIME'].includes(x.type)?'text':null
  return kind?{id:'A:'+x.instrumentKey+':'+x.itemKey,
    label:x.instrumentKey+' / '+(x.prompt||x.itemKey),
    field:{source:'ANSWER',instrumentKey:x.instrumentKey,itemKey:x.itemKey},
    kind,options:x.options.map(o=>({key:o.optionKey,label:o.label}))}:null
}
function ConditionEditor({value,onChange,fields,depth=0}:{value:FlowCondition;
  onChange:(next:FlowCondition)=>void;fields:FieldChoice[];depth?:number}){
  const fieldId='field' in value?(value.field.source==='EMBEDDED'
    ?'E:'+value.field.key:'A:'+value.field.instrumentKey+':'+value.field.itemKey):''
  const selected=fields.find(f=>f.id===fieldId)??fields[0]
  const comparisons=selected?.kind==='number'?['EQUALS','GT','GTE','LT','LTE','IS_MISSING']:
    selected?.kind==='choices'?['INCLUDES','IS_MISSING']:
    ['EQUALS','IS_MISSING']
  const changeOp=(op:string)=>{
    if(op==='AND'||op==='OR')onChange({op,terms:[defaultPredicate(fields),defaultPredicate(fields)]})
    else if(op==='NOT')onChange({op,term:defaultPredicate(fields)})
    else if(selected)onChange({op:op as 'EQUALS'|'INCLUDES'|'GT'|'GTE'|'LT'|'LTE'|'IS_MISSING',
      field:selected.field,...(op==='IS_MISSING'?{}:{value:defaultValue(selected)})})
  }
  return <div className="rounded-lg border border-slate-200 p-3 space-y-2">
    <label className="block text-xs">条件运算
      <select className="input block w-full" aria-label="条件运算" value={value.op}
        onChange={e=>changeOp(e.target.value)}>
        {depth<5&&['AND','OR','NOT'].map(op=><option key={op} value={op}>
          {op==='AND'?'全部满足（AND）':op==='OR'?'任意满足（OR）':'条件取反（NOT）'}</option>)}
        {['EQUALS','INCLUDES','GT','GTE','LT','LTE','IS_MISSING'].map(op=>
          <option key={op} value={op} disabled={!comparisons.includes(op)}>
            {{EQUALS:'等于',INCLUDES:'多选包含',GT:'大于',GTE:'大于等于',LT:'小于',LTE:'小于等于',
              IS_MISSING:'明确缺失／未回答'}[op as 'EQUALS']}</option>)}
      </select>
    </label>
    {(value.op==='AND'||value.op==='OR')&&<div className="space-y-2">
      {value.terms.map((term,index)=><div key={index} className="space-y-1">
        <ConditionEditor value={term} depth={depth+1} fields={fields}
          onChange={next=>onChange({...value,terms:value.terms.map((x,i)=>i===index?next:x)})}/>
        <button className="btn-secondary text-xs" type="button" disabled={value.terms.length<=1}
          onClick={()=>onChange({...value,terms:value.terms.filter((_,i)=>i!==index)})}>删除此条件</button>
      </div>)}
      <button className="btn-secondary" type="button" disabled={depth>=5||value.terms.length>=8}
        onClick={()=>onChange({...value,terms:[...value.terms,defaultPredicate(fields)]})}>增加子条件</button>
    </div>}
    {value.op==='NOT'&&<ConditionEditor value={value.term} depth={depth+1}
      fields={fields} onChange={term=>onChange({...value,term})}/>}
    {!['AND','OR','NOT'].includes(value.op)&&'field' in value&&<>
      <label className="block text-xs">条件来源（仅此前已完成的 Form 或静态变量）
        <select className="input block w-full" aria-label="条件来源" value={fieldId}
          onChange={e=>{
            const field=fields.find(f=>f.id===e.target.value)
            if(field)onChange({op:field.kind==='choices'?'INCLUDES':'EQUALS',
              field:field.field,value:defaultValue(field)})
          }}>
          {fields.map(f=><option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      </label>
      {value.op!=='IS_MISSING'&&selected&&<label className="block text-xs">比较值
        {selected.kind==='choice'||selected.kind==='choices'
          ?<select className="input block w-full" aria-label="条件比较值"
            value={String(value.value??'')} onChange={e=>onChange({...value,value:e.target.value})}>
            {selected.options.map(o=><option value={o.key} key={o.key}>{o.label}</option>)}
          </select>
          :selected.kind==='boolean'
            ?<select className="input block w-full" aria-label="布尔条件比较值"
              value={String(value.value)} onChange={e=>onChange({...value,value:e.target.value==='true'})}>
              <option value="true">真</option><option value="false">假</option></select>
            :<input className="input block w-full" aria-label="条件比较值"
              type={selected.kind==='number'?'number':'text'} step="any"
              value={String(value.value??'')} onChange={e=>onChange({...value,
                value:selected.kind==='number'?Number(e.target.value):e.target.value})}/>}
      </label>}
    </>}
  </div>
}
export function SurveyFlowStudio({value,onChange,tools,selectedIds,questions,collectionMode}:{
  value:FlowDraft|null;onChange:(next:FlowDraft|null)=>void;
  tools:ToolInfo[];selectedIds:string[];questions:FormQuestionInfo[];
  collectionMode:'SINGLE_UNLINKED'|'LINKED_WAVES'
}){
  const selected=tools.filter(t=>selectedIds.includes(t.id))
  const allAvailable=selectedIds.every(id=>tools.some(t=>t.id===id))
  const apply=(next:FlowDraft)=>onChange(next)
  const addBlock=(kind:FlowBlock['kind'])=>{
    if(!value)return
    let next:FlowBlock
    if(kind==='INSTRUMENT'){
      const used=new Set(value.blocks.filter(b=>b.kind==='INSTRUMENT').map(b=>b.instrumentKey))
      const available=selected.find(t=>!used.has(t.instrumentKey))
      if(!available)return
      next={blockKey:researchKey('b'),kind,instrumentKey:available.instrumentKey}
    }else if(kind==='MATERIAL')next={blockKey:researchKey('b'),kind,title:'材料标题',body:''}
    else{
      const formBlock=value.blocks.find(b=>b.kind==='INSTRUMENT'&&
        questions.some(q=>q.instrumentKey===b.instrumentKey))
      const q=questions.find(q=>q.instrumentKey===formBlock?.instrumentKey)
      if(!q)return
      const field=itemField(q)
      if(!field)return
      next={blockKey:researchKey('b'),kind,termination:'SCREEN_OUT',
        when:{op:'EQUALS',field:field.field,value:defaultValue(field)}}
    }
    apply({...value,blocks:[...value.blocks,next]})
  }
  const updateBlock=(index:number,fn:(old:FlowBlock)=>FlowBlock)=>{
    if(!value)return
    apply({...value,blocks:value.blocks.map((b,i)=>i===index?fn(b):b)})
  }
  if(!value)return <section className="rounded-xl border p-4 space-y-2">
    <h4 className="font-semibold">Survey Flow · 实验与流程（可选）</h4>
    <p className="text-sm text-slate-600">默认仍按现有顺序完成全部研究工具。启用后可以配置冻结的材料、随机组、可审核条件路径，不能上传 JS。</p>
    <button className="btn-secondary" type="button" disabled={!selectedIds.length||!allAvailable}
      onClick={()=>apply({schemaVersion:1,embeddedData:[],blocks:selected.map(tool=>({
        blockKey:researchKey('b'),kind:'INSTRUMENT' as const,instrumentKey:tool.instrumentKey,
      }))})}>启用 Flow V1</button>
    {!allAvailable&&<p role="alert" className="text-sm text-amber-700">已选择的工具不在当前列表页，需先切换列表页确认编码后再启用流程。</p>}
  </section>
  const used=new Set(value.blocks.filter(x=>x.kind==='INSTRUMENT').map(x=>x.instrumentKey))
  const missing=selected.filter(t=>!used.has(t.instrumentKey))
  const unavailable=value.blocks.filter(b=>b.kind==='INSTRUMENT'&&
    !selected.some(t=>t.instrumentKey===b.instrumentKey))
  return <section className="rounded-xl border p-4 space-y-4">
    <div className="flex gap-2 justify-between flex-wrap items-center">
      <div><h4 className="font-semibold">Survey Flow V1 · 冻结执行图</h4>
        <p className="text-xs text-slate-600">研究者配置静态规则；FINAL 将根据经校验的答案计算实际路径。</p></div>
      <button className="btn-secondary" type="button" onClick={()=>onChange(null)}>关闭 Flow（恢复传统全部作答）</button>
    </div>
    {(missing.length>0||unavailable.length>0)&&<p role="alert" className="text-sm text-red-700">
      工具与 Flow 块不一致：缺少 {missing.map(t=>t.title).join('、')||'无'}；
      未选中 {unavailable.map(b=>b.instrumentKey).join('、')||'无'}。冻结前须一致。
    </p>}
    <fieldset className="rounded-lg border p-3 space-y-3">
      <legend className="font-medium text-sm">实验随机分配（可选）</legend>
      {!value.experiment?<button type="button" className="btn-secondary" onClick={()=>apply({...value,
        experiment:{experimentKey:researchKey('exp'),linkedPolicy:'RERANDOMIZE',
          groups:[{groupKey:researchKey('g'),weight:1,materialTitle:'积极材料',materialBody:''},
            {groupKey:researchKey('g'),weight:1,materialTitle:'风险材料',materialBody:''}]}})}>
        添加研究实验分组</button>:<>
        <label className="block text-sm">跨波次分组政策
          <select className="input block w-full" value={value.experiment.linkedPolicy}
            onChange={e=>apply({...value,experiment:{...value.experiment!,
              linkedPolicy:e.target.value as 'KEEP_LINKED'|'RERANDOMIZE'}})}>
            <option value="RERANDOMIZE">每一波次重新使用加密安全随机数分组</option>
            {collectionMode==='LINKED_WAVES'&&<option value="KEEP_LINKED">关联 T1/T2/T3 保持同一研究实验组</option>}
          </select>
        </label>
        {value.experiment.groups.map((group,i)=><div key={group.groupKey} className="rounded border p-3 grid sm:grid-cols-2 gap-2">
          <label className="text-xs">研究内部组别编码（被试不会看到）
            <input className="input block w-full" value={group.groupKey} readOnly/></label>
          <label className="text-xs">随机权重（1–100，等权即等概率）
            <input className="input block w-full" type="number" min={1} max={100} step={1}
              value={group.weight} onChange={e=>apply({...value,experiment:{...value.experiment!,
                groups:value.experiment!.groups.map((g,j)=>j===i?{...g,weight:Number(e.target.value)}:g)}})}/>
          </label>
          <label className="text-xs">呈现材料标题
            <input className="input block w-full" value={group.materialTitle}
              onChange={e=>apply({...value,experiment:{...value.experiment!,
                groups:value.experiment!.groups.map((g,j)=>j===i?{...g,materialTitle:e.target.value}:g)}})}/>
          </label>
          <label className="text-xs sm:col-span-2">呈现材料（每组必须填写）
            <textarea className="input block w-full" rows={3} value={group.materialBody}
              onChange={e=>apply({...value,experiment:{...value.experiment!,
                groups:value.experiment!.groups.map((g,j)=>j===i?{...g,materialBody:e.target.value}:g)}})}/></label>
          <button type="button" className="btn-secondary text-xs" disabled={value.experiment.groups.length<=2}
            onClick={()=>apply({...value,experiment:{...value.experiment!,
              groups:value.experiment!.groups.filter((_,j)=>i!==j)}})}>移除此组</button>
        </div>)}
        <div className="flex gap-2 flex-wrap">
          <button className="btn-secondary" type="button" disabled={value.experiment.groups.length>=8}
            onClick={()=>apply({...value,experiment:{...value.experiment!,
              groups:[...value.experiment!.groups,{groupKey:researchKey('g'),weight:1,
                materialTitle:'中性材料',materialBody:''}]}})}>增加实验组</button>
          <button className="btn-secondary" type="button" onClick={()=>apply({...value,experiment:undefined})}>
            删除实验设计</button>
        </div>
      </>}
    </fieldset>
    <fieldset className="rounded-lg border p-3 space-y-2">
      <legend className="font-medium text-sm">有类型的 Embedded Data（静态研究变量）</legend>
      {value.embeddedData.map((entry,i)=><div className="grid sm:grid-cols-3 gap-2" key={i}>
        <label className="text-xs">变量编码
          <input className="input block w-full" value={entry.key}
            onChange={e=>apply({...value,embeddedData:value.embeddedData.map((v,j)=>j===i?{...v,key:e.target.value}:v)})}/></label>
        <label className="text-xs">类型
          <select className="input block w-full" value={entry.type}
            onChange={e=>{
              const type=e.target.value as typeof entry.type
              apply({...value,embeddedData:value.embeddedData.map((v,j)=>j===i?{
                ...v,type,value:type==='NUMBER'?0:type==='BOOLEAN'?false:'',
              }:v)})
            }}><option value="STRING">文本</option><option value="NUMBER">数字</option>
            <option value="BOOLEAN">布尔</option></select></label>
        <label className="text-xs">固定值
          {entry.type==='BOOLEAN'?<select className="input block w-full" value={String(entry.value)}
            onChange={e=>apply({...value,embeddedData:value.embeddedData.map((v,j)=>j===i?{
              ...v,value:e.target.value==='true'}:v)})}><option value="true">真</option><option value="false">假</option></select>:
            <input className="input block w-full" type={entry.type==='NUMBER'?'number':'text'}
              step="any" value={String(entry.value)}
              onChange={e=>apply({...value,embeddedData:value.embeddedData.map((v,j)=>j===i?{
                ...v,value:entry.type==='NUMBER'?Number(e.target.value):e.target.value}:v)})}/>}
        </label>
        <button className="btn-secondary text-xs sm:col-span-3" type="button"
          onClick={()=>apply({...value,embeddedData:value.embeddedData.filter((_,j)=>j!==i)})}>删除变量</button>
      </div>)}
      <button className="btn-secondary" type="button" disabled={value.embeddedData.length>=30}
        onClick={()=>apply({...value,embeddedData:[...value.embeddedData,{
          key:researchKey('var'),source:'STATIC',type:'STRING',value:''}]})}>增加静态变量</button>
      <p className="text-xs text-slate-500">材料可使用 <code>{'{{变量编码}}'}</code> 插入上述静态值。纯文本替换，不执行脚本或读取其他用户数据。</p>
    </fieldset>
    <fieldset className="space-y-3">
      <legend className="font-medium text-sm">按顺序执行的研究块（最多 64 个）</legend>
      {value.blocks.map((block,index)=>{
        const available=new Set(value.blocks.slice(0,index).filter(b=>b.kind==='INSTRUMENT').map(b=>b.instrumentKey))
        const fields:FieldChoice[]=[
          ...questions.filter(q=>available.has(q.instrumentKey)).map(itemField).filter((x):x is FieldChoice=>!!x),
          ...value.embeddedData.map(e=>({id:'E:'+e.key,label:'Embedded · '+e.key,
            field:{source:'EMBEDDED',key:e.key} as FlowField,
            kind:(e.type==='NUMBER'?'number':e.type==='BOOLEAN'?'boolean':'text') as FieldChoice['kind'],
            options:[] as FieldChoice['options']})),
        ]
        return <div className="rounded-lg border p-3 space-y-3" key={block.blockKey}>
          <div className="flex flex-wrap justify-between gap-2 items-center">
            <strong className="text-sm">步骤 {index+1} · {block.kind}</strong>
            <div className="flex flex-wrap gap-1">
              <button className="btn-secondary text-xs" type="button" disabled={index===0}
                onClick={()=>{
                  const blocks=value.blocks.slice();[blocks[index-1],blocks[index]]=[blocks[index],blocks[index-1]]
                  apply({...value,blocks})
                }}>上移</button>
              <button className="btn-secondary text-xs" type="button" disabled={index===value.blocks.length-1}
                onClick={()=>{
                  const blocks=value.blocks.slice();[blocks[index+1],blocks[index]]=[blocks[index],blocks[index+1]]
                  apply({...value,blocks})
                }}>下移</button>
              <button className="btn-secondary text-xs" type="button"
                onClick={()=>apply({...value,blocks:value.blocks.filter((_,i)=>i!==index)})}>删除</button>
            </div>
          </div>
          {block.kind==='INSTRUMENT'&&<label className="block text-xs">研究工具
            <select className="input block w-full" value={block.instrumentKey??''}
              onChange={e=>updateBlock(index,b=>({...b,instrumentKey:e.target.value}))}>
              <option value="">请选择研究工具</option>
              {selected.map(t=><option key={t.id} value={t.instrumentKey}>{t.kind} · {t.title}</option>)}
            </select>
          </label>}
          {block.kind==='MATERIAL'&&<>
            <label className="block text-xs">素材标题
              <input className="input block w-full" value={block.title??''}
                onChange={e=>updateBlock(index,b=>({...b,title:e.target.value}))}/></label>
            <label className="block text-xs">素材正文
              <textarea className="input block w-full" value={block.body??''} rows={3}
                onChange={e=>updateBlock(index,b=>({...b,body:e.target.value}))}/></label>
          </>}
          {block.kind==='END'&&<label className="block text-xs">终止类别
            <select className="input block w-full" value={block.termination??'SCREEN_OUT'}
              onChange={e=>updateBlock(index,b=>({...b,
                termination:e.target.value as 'SCREEN_OUT'|'COMPLETE_EARLY'}))}>
              <option value="SCREEN_OUT">筛除：不生成有效 FINAL</option>
              <option value="COMPLETE_EARLY">提前完成：后续工具均标记 NOT_SHOWN</option>
            </select></label>}
          <div>
            {block.when?<><p className="text-xs mb-2">显示／执行条件（只引用此前工具或固定变量）</p>
              <ConditionEditor value={block.when} fields={fields}
                onChange={when=>updateBlock(index,b=>({...b,when}))}/>
              {block.kind!=='END'&&<button className="btn-secondary text-xs mt-1" type="button"
                onClick={()=>updateBlock(index,b=>({...b,when:undefined}))}>清除条件</button>}
            </>:<button className="btn-secondary" type="button" disabled={fields.length===0}
              onClick={()=>updateBlock(index,b=>({...b,when:defaultPredicate(fields)}))}>
              {block.kind==='END'?'配置必要的终止条件':'设置条件'}</button>}
          </div>
        </div>
      })}
      <div className="flex flex-wrap gap-2">
        <button className="btn-secondary" type="button"
          disabled={value.blocks.length>=64||missing.length===0} onClick={()=>addBlock('INSTRUMENT')}>
          增加未使用工具块</button>
        <button className="btn-secondary" type="button"
          disabled={value.blocks.length>=64} onClick={()=>addBlock('MATERIAL')}>
          增加研究材料</button>
        <button className="btn-secondary" type="button"
          disabled={value.blocks.length>=64||!value.blocks.some(b=>b.kind==='INSTRUMENT'&&
            questions.some(q=>q.instrumentKey===b.instrumentKey))}
          onClick={()=>addBlock('END')}>增加条件终止</button>
      </div>
    </fieldset>
  </section>
}
