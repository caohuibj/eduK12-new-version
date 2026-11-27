import type {GovernedItem} from '../../api/surveyGovernance'

type CatalogRow=Pick<GovernedItem,'family'|'toolKey'|'toolVersion'|'title'|'state'>
const keyPattern=/^(SCALE|FORM|COGNITIVE|SJT|COMBINATION|BUNDLE):.+$/

/** The license picker uses a stable family/key identity, never a release UUID. */
export default function GovernedToolLicenseLink({row,disabled=false}:{row:CatalogRow;disabled?:boolean}){
 if(!['ONLINE','WITHDRAWN'].includes(row.state)||typeof row.toolKey!=='string')return null
 const key=row.toolKey.startsWith(row.family+':')?row.toolKey:row.family+':'+row.toolKey
 if(key.length>300||!keyPattern.test(key)||[...key].some(character=>character.charCodeAt(0)<=32||character.charCodeAt(0)===127))return null
 const query=new URLSearchParams({view:'tools',product:'SURVEY',toolKey:key})
 const historical=row.state==='WITHDRAWN'
 return <section aria-label={'工具许可 · '+row.title}>
  <h4>工具许可</h4>
  <p>{historical?'此精确版本已停止新增使用。可回查该工具系列的已有许可；历史许可不使此版本恢复可用。':'前往统一工作台，按研究者账号管理该工具系列的商业许可、有效期和额度。'}</p>
  <div className="system-actions"><a className="hui-button hui-button--secondary" aria-disabled={disabled||undefined} tabIndex={disabled?-1:undefined} onClick={event=>{if(disabled)event.preventDefault()}} href={'/admin/permissions?'+query.toString()}>{historical?'查看已有工具许可':'管理工具许可'}</a></div>
  <p className="sys-muted">仅带入 Survey 工具检索条件，不自动选择或签发。许可不替代入口准入、精确版本使用授权或管理员身份。</p>
  {(row.family==='COMBINATION'||row.family==='BUNDLE')&&<p className="sys-muted">整包许可不授予组件拆用权限。</p>}
  <details className="sys-technical"><summary>许可来源与版本边界</summary><p>当前治理版本：{row.toolVersion}。商业许可按工具系列管理，不锁定为当前精确版本；工作台仍按所选入口的实时可许可目录核对。</p><code>{key}</code></details>
 </section>
}
