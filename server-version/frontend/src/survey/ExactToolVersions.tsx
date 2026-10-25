import {toolFamilyLabels,type ComponentSummary,type VersionAxes} from '../api/surveyGovernance'
export function exactVersionLabel(versions:VersionAxes|null|undefined,hash:string,kind?:string){
 return versions?`内容 ${versions.content} · 参数 ${versions.parameters??(kind==='FORM'?'不适用':'未配置')} · 报告 ${versions.report??(kind==='FORM'?'不适用':'无报告')} · #${hash.slice(0,12)}`:`固定版本 #${hash.slice(0,12)} · 参数与报告版本请核对详情`
}
export function ExactToolVersions({versions,hash,kind}:{versions?:VersionAxes;hash:string;kind?:string}){return <p>{exactVersionLabel(versions,hash,kind)}</p>}
export function PackageComponentVersions({components}:{components:ComponentSummary[]}){return <ol>{components.map(c=><li key={c.slotKey}>{c.title} · {toolFamilyLabels[c.kind as keyof typeof toolFamilyLabels]??c.kind}<small className="block">{exactVersionLabel(c.versions,c.source?.hash??c.source?.id??c.slotKey,c.kind)}</small></li>)}</ol>}
