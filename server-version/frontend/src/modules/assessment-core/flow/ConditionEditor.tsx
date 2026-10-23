import type {FlowCondition} from './conditions'
import './condition-editor.css'

import {defaultPredicate,defaultValue,type FieldChoice} from './conditions'
export function ConditionEditor({value,onChange,fields,depth=0,operators=['EQUALS','INCLUDES','GT','GTE','LT','LTE','IS_MISSING'],sourceLabel='条件来源（仅此前已完成的 Form 或静态变量）',appearance='survey'}:{value:FlowCondition;
  onChange:(next:FlowCondition)=>void;fields:FieldChoice[];depth?:number;operators?:string[];sourceLabel?:string;appearance?:'survey'|'training'}){
  const fieldId='field' in value?(value.field.source==='EMBEDDED'
    ?'E:'+value.field.key:'A:'+value.field.instrumentKey+':'+value.field.itemKey):''
  const selected=fields.find(f=>f.id===fieldId)
  const comparisons=selected?.kind==='number'?['EQUALS','GT','GTE','LT','LTE','IS_MISSING']:
    selected?.kind==='choices'?['INCLUDES','IS_MISSING']:
    ['EQUALS','IS_MISSING']
  const changeOp=(op:string)=>{
    if(op==='AND'||op==='OR')onChange({op,terms:[defaultPredicate(fields),defaultPredicate(fields)]})
    else if(op==='NOT')onChange({op,term:defaultPredicate(fields)})
    else if(selected)onChange({op:op as 'EQUALS'|'INCLUDES'|'GT'|'GTE'|'LT'|'LTE'|'IS_MISSING',
      field:selected.field,...(op==='IS_MISSING'?{}:{value:defaultValue(selected)})})
  }
  return <div className="shared-flow-condition rounded-lg border border-slate-200 p-3 space-y-2" data-appearance={appearance}>
    <label className="block text-xs">条件运算
      <select className="input block w-full" aria-label="条件运算" value={value.op}
        onChange={e=>changeOp(e.target.value)}>
        {depth<5&&['AND','OR','NOT'].map(op=><option key={op} value={op}>
          {op==='AND'?'全部满足（AND）':op==='OR'?'任意满足（OR）':'条件取反（NOT）'}</option>)}
        {operators.map(op=>
          <option key={op} value={op} disabled={!comparisons.includes(op)}>
            {{EQUALS:'等于',INCLUDES:'多选包含',GT:'大于',GTE:'大于等于',LT:'小于',LTE:'小于等于',
              IS_MISSING:'明确缺失／未回答'}[op as 'EQUALS']}</option>)}
      </select>
    </label>
    {(value.op==='AND'||value.op==='OR')&&<div className="space-y-2">
      {value.terms.map((term,index)=><div key={index} className="space-y-1">
        <ConditionEditor value={term} depth={depth+1} fields={fields} operators={operators} sourceLabel={sourceLabel} appearance={appearance}
          onChange={next=>onChange({...value,terms:value.terms.map((x,i)=>i===index?next:x)})}/>
        <button className="btn-secondary text-xs" type="button" disabled={value.terms.length<=1}
          onClick={()=>onChange({...value,terms:value.terms.filter((_,i)=>i!==index)})}>删除此条件</button>
      </div>)}
      <button className="btn-secondary" type="button" disabled={depth>=5||value.terms.length>=8}
        onClick={()=>onChange({...value,terms:[...value.terms,defaultPredicate(fields)]})}>增加子条件</button>
    </div>}
    {value.op==='NOT'&&<ConditionEditor value={value.term} depth={depth+1}
      fields={fields} operators={operators} sourceLabel={sourceLabel} appearance={appearance} onChange={term=>onChange({...value,term})}/>}
    {!['AND','OR','NOT'].includes(value.op)&&'field' in value&&<>
      <label className="block text-xs">{sourceLabel}
        <select className="input block w-full" aria-label="条件来源" value={fieldId}
          onChange={e=>{
            const field=fields.find(f=>f.id===e.target.value)
            if(field)onChange({op:field.kind==='choices'?'INCLUDES':'EQUALS',
              field:field.field,value:defaultValue(field)})
          }}>
          {!selected&&<option value={fieldId} disabled>已移除或当前不可引用的来源</option>}
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
