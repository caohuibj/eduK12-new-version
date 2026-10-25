/** Unified management contract. Pure policy only: adapters must load current DB
 * identities, immutable manifests and explicit grants; client assertions never grant authority.
 * Runtime switching is tracked separately from the common boundary contract. */
export const TOOL_FAMILIES = ['SCALE','COGNITIVE','SJT','FORM','COMBINATION','BUNDLE'] as const
export type ToolFamily = typeof TOOL_FAMILIES[number]
export type Product = 'TRAINING'|'SURVEY'
export type ManagementRole = 'SYSTEM_ADMIN'|'TRAINING_ADMIN'|'SURVEY_ADMIN'|'SCHOOL_ADMIN'|'TEACHER_ADMIN'
export type ManagementAction = 'people.manage'|'use.assign'|'entry.review'|'entry.pause'|'tool.approve'|'tool.withdraw'|'admin.appoint'|'data.view'|'data.export'
export const MANAGEMENT_RULES:ReadonlyArray<{action:ManagementAction;label:string;training:string;survey:string;system:string}> = [
 {action:'people.manage',label:'管理人员与资格',training:'仅 Training 人员',survey:'仅 Survey 研究者',system:'不代管入口人员'},
 {action:'use.assign',label:'分配或撤销使用授权',training:'仅 Training 精确版本',survey:'仅 Survey 精确版本',system:'不代替入口管理员分配'},
 {action:'entry.review',label:'审核本入口使用范围',training:'仅 Training',survey:'仅 Survey',system:'可以指定入口'},
 {action:'entry.pause',label:'暂停本入口新增使用',training:'仅 Training',survey:'仅 Survey',system:'可以指定入口'},
 {action:'tool.approve',label:'批准工具版本及试运行',training:'不可以',survey:'不可以',system:'可以；通过试运行后上线'},
 {action:'tool.withdraw',label:'全局下架与紧急停用',training:'不可以',survey:'不可以',system:'可以；影响范围须显示'},
 {action:'admin.appoint',label:'任命管理员及平台授权',training:'不可以',survey:'不可以',system:'可以；记录原因和审计'},
 {action:'data.view',label:'凭管理身份查看私有答卷/报告',training:'不自动获得',survey:'不可以',system:'单独数据审计入口；近期双因素、原因及留痕'},
 {action:'data.export',label:'下载与批量导出',training:'必须另有精确数据授权',survey:'必须另有精确数据授权',system:'必须另有精确数据授权；仅去隐私数据'},
]
export function managementAllows(role:ManagementRole,action:ManagementAction,product:Product|'HUISCHOOL'|'HUITEACHER'):boolean {
 const entryRole={TRAINING:'TRAINING_ADMIN',SURVEY:'SURVEY_ADMIN',HUISCHOOL:'SCHOOL_ADMIN',HUITEACHER:'TEACHER_ADMIN'}[product]
 if(action==='data.export'||action==='data.view')return false // Separate proof/grant policy always required.
 if(action==='tool.approve'||action==='tool.withdraw'||action==='admin.appoint')return role==='SYSTEM_ADMIN'
 if(action==='people.manage'||action==='use.assign')return role===entryRole
 return role==='SYSTEM_ADMIN'||role===entryRole
}
export type VersionPin={version:string;hash:string}
export type ComponentPin={slotKey:string;family:Exclude<ToolFamily,'BUNDLE'|'COMBINATION'>;toolKey:string;content:VersionPin;parameters:VersionPin|null;report:VersionPin|null}
export type ToolManifest={family:ToolFamily;toolKey:string;releaseHash:string;content:VersionPin;parameters:VersionPin|null;report:VersionPin|null;components:ComponentPin[];reportInputs:Array<{slotKey:string;componentHash:string;metricKey:string}>}
export type PackageGrant={subjectId:string;product:Product;releaseHash:string;status:'ACTIVE'|'REVOKED';validFrom:number;expiresAt:number|null;mode:'STANDALONE'|'PACKAGE_ONLY'}
export type UseContext={subjectId:string;product:Product;now:number;operation:'STANDALONE'|'PACKAGE';grant:PackageGrant|null;manifest:ToolManifest;approvedHash:string|null;trialHash:string|null;online:boolean;entryAllowed:boolean;paused:boolean;runtimeSupported:boolean;componentStates:Array<{slotKey:string;contentHash:string;online:boolean;runtimeSupported:boolean;metricKeys:string[]}>}
export function toolUseBlockers(c:UseContext):string[]{
 const b:string[]=[],m=c.manifest,g=c.grant
 if(c.approvedHash!==m.releaseHash)b.push('当前精确版本组合尚未批准')
 if(c.trialHash!==m.releaseHash)b.push('当前精确版本组合尚未通过自动试运行')
 if(!c.online)b.push('当前精确版本尚未上线')
 if(!c.entryAllowed)b.push(c.product+' 入口尚未准入')
 if(c.paused)b.push(c.product+' 新增使用已暂停')
 if(!c.runtimeSupported)b.push(c.product+' 播放、计分或报告运行适配尚未接通')
 if(!g||g.status!=='ACTIVE'||g.subjectId!==c.subjectId||g.product!==c.product||g.releaseHash!==m.releaseHash||g.validFrom>c.now||(g.expiresAt!==null&&g.expiresAt<=c.now))b.push('缺少当前用户在本入口的有效精确版本授权')
 if(g?.mode==='PACKAGE_ONLY'&&c.operation!=='PACKAGE')b.push('整包授权禁止拆用组件')
 if(m.family==='BUNDLE'||m.family==='COMBINATION'){
  if(c.operation!=='PACKAGE'||g?.mode!=='PACKAGE_ONLY')b.push('问卷组合必须使用整包授权')
  if(!m.components.length)b.push('组合尚未固定组件版本')
  const slots=new Set<string>()
  for(const p of m.components){
   if(slots.has(p.slotKey))b.push('组合组件标识重复：'+p.slotKey)
   slots.add(p.slotKey)
   const state=c.componentStates.find(s=>s.slotKey===p.slotKey)
   if(!state||state.contentHash!==p.content.hash)b.push('组件版本绑定不匹配：'+p.slotKey)
   if(!state?.online)b.push('组件未上线或已全局停止新增使用：'+p.slotKey)
   if(!state?.runtimeSupported)b.push('组件运行适配尚未接通：'+p.slotKey)
  }
  for(const input of m.reportInputs){
   const pin=m.components.find(p=>p.slotKey===input.slotKey),state=c.componentStates.find(p=>p.slotKey===input.slotKey)
   if(!pin||pin.content.hash!==input.componentHash||!state?.metricKeys.includes(input.metricKey))b.push('组合报告输入版本或指标不匹配：'+input.slotKey+'/'+input.metricKey)
  }
  if(m.family==='BUNDLE'&&!m.report)b.push('组合包报告未固定精确版本')
  if(m.family==='BUNDLE'&&!m.reportInputs.length)b.push('组合包报告未绑定组件输入')
  if(m.family==='COMBINATION'&&(m.report||m.reportInputs.length))b.push('单纯组合不含组合报告；请使用组合包')
 }else if(c.operation!=='STANDALONE')b.push('组件不能冒用组合授权')
 // A plain form explicitly has no scoring parameters/report; no artificial three-axis gate.
 if(m.family==='FORM'&&(m.parameters||m.report))b.push('纯表单不承载计分参数或测量报告；请作为有报告组合管理')
 return [...new Set(b)]
}
export const MANAGEMENT_DESIGN = {
 schemaVersion:1,packageAuthorization:'PACKAGE_ONLY_NO_COMPONENT_EXTRACTION',
 rules:MANAGEMENT_RULES.map(rule=>({...rule,school:rule.action==='people.manage'?'仅 School 本组织人员（待接通）':rule.action==='use.assign'?'仅 School 本组织精确版本（待接通）':rule.action.startsWith('entry.')?'仅 School 范围（待接通）':rule.action.startsWith('data.')?'不自动获得；独立授权（待接通）':'不可以',teacher:rule.action==='people.manage'?'仅 Teacher 本组织人员（待接通）':rule.action==='use.assign'?'仅 Teacher 本组织精确版本（待接通）':rule.action.startsWith('entry.')?'仅 Teacher 范围（待接通）':rule.action.startsWith('data.')?'不自动获得；独立授权（待接通）':'不可以'})),
 families:[
  {family:'SCALE',label:'量表',content:'题目、选项、计分定义',parameters:'可留空；无阈值/常模',report:'可留空；不反馈',implementation:'本机新三版本审批流程'},
  {family:'COGNITIVE',label:'认知测评',content:'任务、刺激、运行和计分版本',parameters:'可留空；无阈值/常模',report:'可留空；不反馈',implementation:'已接入精确版本审批与自动试运行'},
  {family:'SJT',label:'情境判断测验（SJT）',content:'场景、分支、选项与评分定义',parameters:'可留空；无阈值/常模（评分定义仍属内容）',report:'可留空；不反馈',implementation:'已接入精确版本审批与自动试运行'},
  {family:'FORM',label:'表单',content:'页面、字段及填写逻辑',parameters:'不适用：纯表单不计分',report:'不适用；有分析报告时纳入组合',implementation:'本人主动提交、系统审核及固定版本授权'},
  {family:'COMBINATION',label:'单纯组合',content:'组件精确版本、顺序及填写关系',parameters:'无额外组合参数；组件参数可留空',report:'没有组合报告；保留组件自身已配置的反馈',implementation:'完整固定组件审批、整包授权与投放'},
  {family:'BUNDLE',label:'组合包',content:'组件精确版本、顺序及填写关系',parameters:'组件参数及跨组件计算规则（如有）',report:'必需：组合报告版本与组件输入对应关系',implementation:'组合报告设计、整包授权、交卷存储与读取'},
 ],
 boundaries:[
  '上线、入口准入、分配使用、投放以及数据访问分别判断，不自动相互授予。',
  '整包授权固定全部组件及组合报告，仅限组合内使用；拆出组件需要独立授权。',
  '缺少单独组件授权不阻止合法整包使用；组件未上线、停用或版本错配必须逐项显示。',
  '量表、认知测验和 SJT 的参数与报告均可明确留空，试运行只检查已配置能力。',
  '单纯组合没有组合报告；组合包包含独立设计的组合报告。',
  '内容或参数、报告及组件映射变化产生新组合，新组合需重新批准和试运行。',
  'Reference 保留作者、文献、标签、来源、申请、加入和批准历史，不作为额外行政上线门槛。',
  '默认只允许页面查看；下载、批量导出单独授权，去隐私导出不包含 Training 学员及 School/Teacher 账户信息。',
  '系统角色与四个入口管理员分别授权，School 与 Teacher 业务接通留待后续。',
  '管理、发布与新参与时核对当前权限；已开始的作答、交卷和已存报告不重跑工具审批授权链。',
 ],
} as const
