export type FormDescriptionData={version:'ordinal-description-v1';
 items:Array<{itemKey:string;prompt:string;label:string;code:number|null;state:string}>;
 exploratoryMeans:Array<{key:string;label:string;completeItems:number;expectedItems:number;value:number|null}>;note:string}
export function FormDescription({report}:{report:FormDescriptionData}){
 if(report.version!=='ordinal-description-v1')return <p>描述规则版本暂不支持。</p>
 return <div aria-label="本次实践自报描述">
  {report.items.map(item=><p key={item.itemKey}>{item.prompt}：{item.label}{item.code!==null?`（类别 ${item.code}）`:''}</p>)}
  {report.exploratoryMeans.map(group=><p key={group.key}>{group.label} · 探索性完整题描述均值：{group.value===null
   ?`未计算（完整 ${group.completeItems}/${group.expectedItems} 题）`:group.value.toLocaleString('zh-CN',{maximumFractionDigits:2})}</p>)}
  <p>{report.note}</p>
 </div>
}
