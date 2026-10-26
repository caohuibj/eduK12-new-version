type Period={from:string;until:string|null}
export type PersonnelAccess={
 state:'PENDING_ACTIVATION'|'ACCOUNT_UNAVAILABLE'|'READY'
 products:{product:string;member:boolean}[]
 functions:{key:string;available:boolean}[]
 memberships:(Period&{orgRole:string;current:boolean})[]
 grants:(Period&{kind:string;code:string;product:string|null;revokedAt:string|null;membershipCurrent:boolean})[]
 assignments:(Period&{kind:string;role:string;grade:string|null;className:string;current:boolean})[]
 denies:{permission:string;from:string;liftedAt:string|null}[]
 professionalScope:{current:number;ended:number};truncated:boolean
}
const labels:Record<string,string>={
 SCHOOL_GOVERNANCE:'School 学校管理',SCHOOL_AUTHOR:'School 私有工具编制',TEACHER_ADMIN:'Teacher 产品管理',TEACHER_AUTHOR:'Teacher 私有工具编制',
 TEACHER:'普通教师',COUNSELOR:'心理教师',STUDENT:'学生',CLIENT:'专业服务对象',PSYCHOLOGY_STAFF:'心理专业能力',REPORT_EXPORT:'报告导出',REPORT_MEMBER_EXPORT:'报告成员导出',PARENT_REPORT_DISCLOSURE:'家长报告披露',
 ORGANIZATION_GOVERNANCE:'学校管理',EDUCATION_ACCESS:'教育产品访问',HUISCHOOL_ACCESS:'School 访问',HUITEACHER_ACCESS:'Teacher 访问',HUISCHOOL_ADMIN:'School 管理',HUITEACHER_ADMIN:'Teacher 管理',REPORT_READ:'报告读取',CLASS_APPROVE:'班级审批',ACTIVITY_MANAGE:'活动管理','*':'全部访问',
}
const product=(value:string)=>value==='HUISCHOOL'?'School':value==='HUITEACHER'?'Teacher':'教育产品'
const when=(value:string|null)=>value?new Date(value).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'未设结束时间'
const period=(p:Period)=><><span>开始 {when(p.from)}</span><span>{p.until?'结束 '+when(p.until):'未设结束时间'}</span></>
export function EducationPersonnelAccess({access}:{access:PersonnelAccess}){
 const available=access.functions.filter(x=>x.available),restrictions=access.denies.filter(x=>!x.liftedAt)
 return <section className="er-personnel-access" aria-label="关系与有效权限">
  <h3>关系与有效权限</h3>
  {access.state==='PENDING_ACTIVATION'?<p>待本人激活或确认。名单和预设任班关系尚未形成账号权限。</p>:<>
   {access.state==='ACCOUNT_UNAVAILABLE'&&<p className="er-access-warning" role="status">账号当前不可用，已有授权记录不会因此变成可用权限。</p>}
   <div className="er-access-products">{access.products.map(p=><span key={p.product} data-available={p.member}>{product(p.product)} · {p.member?'当前成员':'当前不可用'}</span>)}</div>
   <div className="er-access-current">{available.length?available.map(f=><span key={f.key}>{labels[f.key]??'已授权功能'}</span>):<p>当前没有管理或私有工具编制授权；日常活动与观察任务按各自的班级、对象和任务规则核验。</p>}</div>
   {restrictions.length>0&&<p className="er-access-warning">存在 {restrictions.length} 项当前访问限制，授权来源中的记录不代表功能可用。</p>}
   {access.assignments.some(a=>a.current)&&<div className="er-access-assignments"><h4>当前班级与任职</h4><ul>{access.assignments.filter(a=>a.current).map((a,i)=><li key={i}><strong>{[a.grade,a.className].filter(Boolean).join(' / ')} · {a.role==='STUDENT'?'学生':a.role==='HOMEROOM'?'班主任':'任课教师'}</strong><small>{period(a)}</small></li>)}</ul></div>}
   {(access.professionalScope.current>0||access.professionalScope.ended>0)&&<p className="er-access-scope">专业关系登记：当前 {access.professionalScope.current} 项，已结束 {access.professionalScope.ended} 项。这里只展示数量。</p>}
   <details><summary>管理与编制能力说明</summary><ul>{access.functions.map(f=><li key={f.key}>{labels[f.key]??'其他功能'}：{f.available?'当前授权检查通过':'当前授权检查未通过'}</li>)}</ul><p>School 与 Teacher 分别核对产品授权；进入和操作时仍须正常登录，并按原规则完成安全验证。</p></details>
   <details><summary>授权来源与历史</summary>
    {access.memberships.length>0&&<><h4>学校成员关系</h4><ul>{access.memberships.map((m,i)=><li key={i}><strong>{m.orgRole==='ORG_ADMIN'?'登记为学校管理员':'学校成员'} · {m.current?'当前关系':'当前不生效'}</strong><small>{period(m)}</small></li>)}</ul></>}
    {access.grants.length>0&&<><h4>岗位与授权记录</h4><ul>{access.grants.map((g,i)=><li key={i}><strong>{g.product?product(g.product)+' 产品管理员':labels[g.code]??'其他授权记录'} · {g.revokedAt?'已撤销':!g.membershipCurrent?'成员关系当前不生效':'未撤销'}</strong><small>来源：{g.kind==='PERSONA'?'学校岗位登记':g.kind==='CAPABILITY'?'独立能力授权':'产品管理员授权'} · 登记 {when(g.from)}{g.revokedAt?' · 撤销 '+when(g.revokedAt):''}</small></li>)}</ul></>}
    {access.assignments.some(a=>!a.current)&&<><h4>其他任班记录</h4><ul>{access.assignments.filter(a=>!a.current).map((a,i)=><li key={i}><strong>{[a.grade,a.className].filter(Boolean).join(' / ')} · 当前不生效</strong><small>{period(a)}</small></li>)}</ul></>}
    {access.denies.length>0&&<><h4>访问限制记录</h4><ul>{access.denies.map((d,i)=><li key={i}><strong>{labels[d.permission]??'其他访问限制'} · {d.liftedAt?'已解除':'限制中'}</strong><small>登记 {when(d.from)}{d.liftedAt?' · 解除 '+when(d.liftedAt):''}</small></li>)}</ul></>}
    {access.memberships.length+access.grants.length+access.denies.length===0&&<p>当前没有可展示的成员或授权记录。</p>}
   </details>
  </>}
  <details><summary>报告权限另行核验</summary><p>任班、管理员或心理专业能力均不代表可以读取某份报告。实际访问继续检查服务对象、当前关系、具体工具与报告版本，以及独立的家长同意和披露条件；这里不读取报告内容。</p></details>
  {access.truncated&&<p>历史记录较多，此处仅显示最近记录。当前能力由实时判定给出，不依赖这份历史列表是否完整。</p>}
 </section>
}
