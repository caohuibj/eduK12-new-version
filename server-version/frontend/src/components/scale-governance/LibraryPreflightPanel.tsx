import {useEffect,useRef,useState} from 'react'
import {standardRequest} from '../../api/surveyStandard'

export type LibraryPreflight = {
 identity:{instrumentKey:string;instrumentVersion:string};title:string;readOnly:true
 facts:{catalogStatus:string;scientificMaturity:string;contentLocale:string|null;scientificTerritory:string|null;authorship:'SELF_AUTHORED'|'EXTERNAL_OR_UNCONFIRMED';scaleId:string|null;scaleStatus:string|null;visibility:string|null;deploymentRevision:number|null;deploymentTerritory:string|null;approvedReleaseId:string|null}
 stages:Array<{key:string;label:string;state:'COMPLETE'|'READY'|'BLOCKED'|'PENDING';reasons:string[];nextAction:string}>
 targetUseGrant:'NOT_EVALUATED';generatedAt:string
}
const stateLabels={COMPLETE:'已完成',READY:'可进行下一步',BLOCKED:'需处理',PENDING:'尚未执行'}
const reasonLabels:Record<string,string>={
 SCIENTIFIC_DEPLOYMENT_SCOPE_MISMATCH:'部署地域与已有科学参考适用范围不一致，请保留原科学范围并使用正规部署修订处理。',
 SCIENTIFIC_CLAIM_NOT_QUALIFIED:'当前科学声明尚未满足其既有资格要求。',
 SCALE_NOT_INSTALLED:'尚未安装来源版本。',DEPLOYMENT_BINDING_MISSING:'尚无激活的部署绑定。',
 PRODUCT_NOT_READY:'当前内容、计分或报告仍有实际产品就绪问题，请核对来源预检。',
 REFERENCES_NOT_INSTALLED:'该版本声明的科学参考尚未完成安装。',
 SCALE_DEFINITION_CONFLICT:'已安装内容与该来源版本不一致，不能覆盖既有精确版本。',
 DEPLOYMENT_VERSION_CONFLICT:'已有部署属于另一内容版本。',
 AUTHORIZATION_MISSING:'第三方工具缺少当前范围所需的有效许可记录。',
 PUBLICATION_PREVIEW_STALE:'发布预览已变化，请重新读取；不会自动发布。',
}

export default function LibraryPreflightPanel({instrumentKey,instrumentVersion}:{instrumentKey:string;instrumentVersion:string}){
 const [result,setResult]=useState<LibraryPreflight|null>(null),[loading,setLoading]=useState(false),[error,setError]=useState('')
 const epoch=useRef(0)
 useEffect(()=>()=>{epoch.current++},[instrumentKey,instrumentVersion])
 const read=async()=>{
  const current=++epoch.current;setLoading(true);setError('');setResult(null)
  try{const data=await standardRequest<LibraryPreflight>('/preflight/'+encodeURIComponent(instrumentKey)+'/'+encodeURIComponent(instrumentVersion));if(current===epoch.current)setResult(data)}
  catch(e){if(current===epoch.current)setError('只读预检失败：'+(e instanceof Error?e.message:'请重试'))}
  finally{if(current===epoch.current)setLoading(false)}
 }
 return <section className="library-preflight" aria-label="入库与可分配阶段">
  <h3>预检 → 入库 → 版本批准 → 可分配</h3>
  <p>读取当前事实和既有门禁；本预检不会入库、发布、批准版本或分配使用权。</p>
  <button type="button" disabled={loading} onClick={()=>void read()}>{result?'刷新当前阶段（只读）':'读取当前阶段（只读）'}</button>
  {loading&&<p role="status">正在核对当前精确版本的阶段与阻碍…</p>}{error&&<p role="alert">{error}</p>}
  {result&&<>
   <dl className="slg-detail-facts"><div><dt>来源身份</dt><dd>{result.facts.authorship==='SELF_AUTHORED'?'可信自编来源':'第三方或尚未确认的来源'}</dd></div><div><dt>科学成熟度</dt><dd>{({PILOT:'试用',RESEARCH_READY:'研究就绪',RESEARCH_GRADE:'研究级'} as Record<string,string>)[result.facts.scientificMaturity]??result.facts.scientificMaturity}</dd></div><div><dt>实际内容语言</dt><dd>{result.facts.contentLocale??'未声明'}</dd></div><div><dt>科学参考适用地域</dt><dd>{result.facts.scientificTerritory??'未声明'} · 当前部署：{result.facts.deploymentTerritory??'尚无部署'}</dd></div><div><dt>测量发布与可见性</dt><dd>{result.facts.scaleStatus??'尚未安装'} / {result.facts.visibility??'未设置'}</dd></div></dl>
   <ol className="library-preflight-stages">{result.stages.map(stage=><li key={stage.key} data-state={stage.state}><strong>{stage.label} · {stateLabels[stage.state]}</strong>{stage.reasons.length>0&&<ul>{stage.reasons.map((reason,index)=><li key={index}>{reasonLabels[reason]??reason}</li>)}</ul>}<p>{stage.nextAction}</p></li>)}</ol>
   <p>目标用户使用授权尚未评估。版本批准、入口可分配与学生可作答分别核对。</p>
   <small>读取时间：{new Date(result.generatedAt).toLocaleString()}</small>
  </>}
 </section>
}
