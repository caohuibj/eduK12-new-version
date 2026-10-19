import type { SituationalDraftAnswer, SituationalRunnerChannel } from './types'
export function OnlineAnswerField({channel,answer,onChange,name}:{channel:SituationalRunnerChannel;answer?:SituationalDraftAnswer;onChange:(value:string|string[],status:'ANSWERED'|'REFUSED'|'BLANK')=>void;name:string}) {
 const values=Array.isArray(answer?.responseValue)?answer.responseValue:[]
 const multiple=channel.responseType==='MULTIPLE_CHOICE'
 return <div className="space-y-2">
  <p className="text-sm text-gray-600">{channel.required===false?'选填':'必答'}{multiple?` · 请选择 ${channel.minSelections??1}–${channel.maxSelections??6} 项；互斥选项须单独选择`:''}</p>
  {(channel.options??[]).map(o=><label className="flex min-h-11 gap-3 rounded border p-3" key={o.optionKey}><input type={multiple?'checkbox':'radio'} name={name} checked={answer?.status!=='REFUSED'&&answer?.status!=='BLANK'&&(multiple?values.includes(o.optionKey):answer?.responseValue===o.optionKey)} onChange={e=>{if(!multiple){onChange(o.optionKey,'ANSWERED');return}const next=e.target.checked?(channel.exclusiveOptionKeys?.includes(o.optionKey)?[o.optionKey]:[...values.filter(k=>!channel.exclusiveOptionKeys?.includes(k)),o.optionKey]):values.filter(k=>k!==o.optionKey);onChange(next,'ANSWERED')}}/> {o.label}</label>)}
  {channel.allowRefusal&&<label className="block"><input type="radio" name={name+'-status'} checked={answer?.status==='REFUSED'} onChange={()=>onChange('','REFUSED')}/> 明确选择不回答</label>}
  {channel.required===false&&<label className="block"><input type="radio" name={name+'-status'} checked={answer?.status==='BLANK'} onChange={()=>onChange('','BLANK')}/> 此题留空</label>}
 </div>
}
