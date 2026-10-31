import {useId} from 'react'

export type SchoolGroupAudience='PROFESSIONAL'|'TEACHER'|'ORGANIZATION'
export type SchoolPrivateGroupSelection={schemaVersion:1;minimumRespondents:number;leaves:Array<{
 blockId?:string;versionId:string;contentHash:string;audiences:Record<SchoolGroupAudience,string[]>
}>}
export type SchoolPrivateGroupChoice={blockId?:string;versionId:string;contentHash:string;title:string;minimumRespondents:number;
 metrics:Array<{key:string;label:string}>;audiences:Record<SchoolGroupAudience,string[]>}
const audienceLabels={PROFESSIONAL:'心理专业人员',TEACHER:'教师',ORGANIZATION:'学校管理者'} as const
const audienceKeys=['PROFESSIONAL','TEACHER','ORGANIZATION'] as const
const sameLeaf=(a:{blockId?:string;versionId:string;contentHash:string},b:{blockId?:string;versionId:string;contentHash:string})=>
 a.blockId===b.blockId&&a.versionId===b.versionId&&a.contentHash===b.contentHash

/** A controlled publisher editor. Its choices must come from actual server
 * group ceilings; using the component never grants source or manager rights.
 * Keep it unmounted until the corresponding V2 publisher is connected. */
export function SchoolPrivateGroupDisclosure({choices,value,disabled=false,onChange}:{
 choices:ReadonlyArray<SchoolPrivateGroupChoice>;value:SchoolPrivateGroupSelection|null;disabled?:boolean;
 onChange:(value:SchoolPrivateGroupSelection|null)=>void
}){
 const prefix=useId()
 const available=choices.filter(choice=>audienceKeys.some(audience=>choice.audiences[audience].some(key=>choice.metrics.some(metric=>metric.key===key))))
 const minimum=Math.max(10,...available.map(choice=>choice.minimumRespondents))
 const stale=Boolean(value?.leaves.some(leaf=>!available.some(choice=>sameLeaf(choice,leaf)
  &&audienceKeys.every(audience=>leaf.audiences[audience].every(key=>choice.audiences[audience].includes(key))))))
 const select=(choice:SchoolPrivateGroupChoice,audience:SchoolGroupAudience,key:string,checked:boolean)=>{
  if(!value||stale||disabled)return
  const prior=value.leaves.find(leaf=>sameLeaf(leaf,choice))
  const keys=prior?.audiences[audience]??[]
  const changed={blockId:choice.blockId,versionId:choice.versionId,contentHash:choice.contentHash,
   audiences:{PROFESSIONAL:prior?.audiences.PROFESSIONAL??[],TEACHER:prior?.audiences.TEACHER??[],ORGANIZATION:prior?.audiences.ORGANIZATION??[],
    [audience]:checked?[...keys,key]:keys.filter(item=>item!==key)}}
  onChange({...value,leaves:[...value.leaves.filter(leaf=>!sameLeaf(leaf,choice)),changed]
   .filter(leaf=>audienceKeys.some(audience=>leaf.audiences[audience].length))})
 }
 return <fieldset disabled={disabled}>
  <legend>新版本群体报告披露</legend>
  <p>本人报告保留已有获准内容和开放时机。学校仅可在人数和披露条件满足后查看汇总；此设置不增加任何角色的访问权限。</p>
  {!available.length&&<p>当前固定来源没有可选的群体指标。</p>}
  <label><input type="checkbox" checked={value!==null} disabled={!available.length} onChange={event=>onChange(event.target.checked?{schemaVersion:1,minimumRespondents:minimum,leaves:[]}:null)}/>为新来源版本明确选择群体披露</label>
  {value&&<>
   <label htmlFor={prefix+'-minimum'}>汇总最少人数</label>
   <input id={prefix+'-minimum'} type="number" min={minimum} step="1" value={value.minimumRespondents} disabled={stale}
    onChange={event=>{const minimumRespondents=event.target.valueAsNumber;if(Number.isFinite(minimumRespondents))onChange({...value,minimumRespondents})}}/>
   <p>低于人数下限时不展示群体数值；本人已获准报告不受此人数下限影响。</p>
   {stale?<p role="alert">固定来源或群体披露上限已变化。请取消此选择后，按当前来源重新选择。</p>:available.map(choice=><fieldset key={choice.blockId??'standalone'}>
    <legend>{choice.title}</legend>
    {audienceKeys.map(audience=><fieldset key={audience}>
     <legend>{audienceLabels[audience]}</legend>
     {choice.metrics.filter(metric=>choice.audiences[audience].includes(metric.key)).map(metric=><label key={metric.key}>
      <input type="checkbox" checked={Boolean(value.leaves.find(leaf=>sameLeaf(leaf,choice))?.audiences[audience].includes(metric.key))}
       onChange={event=>select(choice,audience,metric.key,event.target.checked)}/>{audienceLabels[audience]} · {metric.label}
     </label>)}
     {!choice.metrics.some(metric=>choice.audiences[audience].includes(metric.key))&&<p>此受众没有获准指标。</p>}
    </fieldset>)}
   </fieldset>)}
   {!value.leaves.length&&!stale&&<p>请至少选择一个受众的群体指标，再发布新来源版本。</p>}
  </>}
 </fieldset>
}
