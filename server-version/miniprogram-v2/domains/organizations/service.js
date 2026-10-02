const { ApiError } = require('../../core/errors/index')
const segment=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new ApiError('invalidRequest','内容标识无效');return encodeURIComponent(value)}
const LABELS={PARENT_REPORT_PUBLICATION:'家长报告发布与授权',CREATE_ORGANIZATION:'新建组织',GOVERN:'成员管理',ASSESSMENT_DELIVERY:'测评投放',RUNS:'测评批次',SUSPEND:'暂停组织',RESUME:'恢复组织',REPORTING:'报告入口',SAFETY:'处置事项'}
function trackFields(resources,index){
 const resource=resources[Number(index)]
 const fields=[{key:'resourceIndex',label:'测评项目',value:index,required:true,choices:resources.map((r,i)=>({value:String(i),label:r.title+' · '+r.version}))}]
 if(!resource)return fields
 for(const [key,label] of [['subjectRoles','评价对象身份'],['respondentRoles','作答者身份'],['relationshipKinds','关系'],['perspectives','观察视角']])fields.push({key,label,required:true,value:resource[key][0],choices:resource[key].map(value=>({value,label:value}))})
 for(const [prefix,label] of [['subject','评价对象'],['respondent','作答者']]){
  fields.push({key:prefix+'Kind',label:label+'范围',value:'ALL_CURRENT',choices:[{value:'ALL_CURRENT',label:'当前获准范围'},{value:'MEMBERSHIP_IDS',label:'指定组织成员'},{value:'CLASS_UNITS',label:'指定班级'},{value:'LABELS',label:'按成员标签'},{value:'RELATED_PARENT',label:'关联家长'}]})
  fields.push({key:prefix+'Match',label:label+'标签匹配方式',value:'ANY',choices:[{value:'ANY',label:'任一标签'},{value:'ALL',label:'全部标签'}]})
  fields.push({key:prefix+'Ids',label:label+'范围编号（选择指定范围时填写，逗号分隔）',multiline:true})
 }
 if(resource.allowedTargetModes&&resource.allowedTargetModes.length){fields.push({key:'targetMode',label:'教师评价对象',value:resource.allowedTargetModes[0],choices:resource.allowedTargetModes.map(value=>({value,label:value}))});fields.push({key:'teacherMembershipIds',label:'指定教师成员编号（逗号分隔）'});fields.push({key:'courseId',label:'指定课程编号'})}
 return fields
}
function createOrganizationService(api,session){
 const root=organizationId=>'/organizations/'+segment(organizationId)
 async function context(organizationId){if(!session.get().capabilities.canDiscoverOrganizations)throw new ApiError('forbidden','组织入口不可用');return api.get(root(organizationId)+'/context')}
 async function view(options){const organizationId=options.organizationId,runId=options.runId,page=options.page||1,kind=options.view||'organizations'
  if(kind==='organizations'){const data=await api.get('/organizations?page='+page+'&pageSize=20');return {title:'组织',list:data.list.map(o=>({id:o.id,title:o.name,status:o.status,canOpen:true})),hasMore:page*20<data.total,actions:(data.allowedActions||[]).filter(a=>LABELS[a]).map(key=>({key,label:LABELS[key]}))}}
  if(kind==='context'){const c=await context(organizationId);return {title:c.organization.name,description:c.organization.status,actions:c.allowedActions.filter(a=>LABELS[a]&&(a!=='RUNS'||c.allowedActions.includes('ASSESSMENT_DELIVERY'))).map(key=>({key,label:LABELS[key]})),list:[]}}
  if(kind==='members'){const data=await api.get('/mobile/organizations/'+segment(organizationId)+'/memberships?page='+page+'&pageSize=20');return {title:'组织成员',list:data.list.map(m=>({id:m.id,title:m.user.nickname||m.user.username,status:m.orgRole,detail:m.validUntil?'成员关系截止：'+m.validUntil:'当前成员关系',canOpen:false,value:m})),hasMore:page*20<data.total,actions:[{key:'ADD_MEMBER',label:'添加成员'}]}}
  if(kind==='runs'){const c=await context(organizationId);if(!c.allowedActions.includes('ASSESSMENT_DELIVERY'))throw new ApiError('forbidden','没有测评投放权限');const data=await api.get(root(organizationId)+'/runs?page='+page+'&pageSize=20');return {title:'测评批次',list:data.list.map(r=>({id:r.id,title:r.name,status:r.status,detail:'测评项目 '+r.trackCount+' · 执行记录 '+r.executionCount,canOpen:true})),hasMore:page*20<data.total,actions:[{key:'CREATE_RUN',label:'新建测评批次'}]}}
  if(kind==='run'){const data=await api.get(root(organizationId)+'/runs/'+segment(runId));return {title:data.run.name,description:data.run.status,version:data.run.version,tracks:data.tracks.map(t=>({id:t.id,title:t.resourceKey,detail:'版本 '+t.resourceVersion,status:t.resourceFamily,canOpen:false})),actions:data.availableActions.map(key=>({key,label:{ADD_TRACK:'添加测评项目',PREVIEW_PUBLISH:'发布前预览',PROGRESS:'执行进度',CLOSE:'关闭批次',CANCEL:'取消批次'}[key]})),list:[]}}
  if(kind==='progress'){const p=await api.get(root(organizationId)+'/runs/'+segment(runId)+'/progress');return {title:'测评执行进度',list:Object.entries(p.counts).map(([state,count])=>({id:state,title:state,status:String(count),canOpen:false})),actions:[]}}
  if(kind==='reporting'){const data=await api.get(root(organizationId)+'/reporting/specs?page='+page+'&pageSize=20');return {title:'正式报告入口',notice:'已发布报告方案由服务器提供；报告生成、分析与完整展示使用正式网页工作区。',webTarget:'/organizations/'+organizationId+'/reporting',list:(data.list||[]).map(s=>({id:s.id||s.specId,title:s.name||s.specKey||'报告方案',status:s.analysisKind||'',canOpen:false})),hasMore:page*20<data.total,actions:[]}}
  if(kind==='safety'){const data=await api.get(root(organizationId)+'/safety/cases');return {title:'当前获准的处置事项',list:data.list.map(s=>({id:s.caseId,title:'处置事项',status:s.status,detail:'投影：'+s.projection,canOpen:false})),actions:[],truncated:data.truncated}}
  throw new ApiError('invalidRequest','组织页面无效')
 }
 async function form(options){const kind=options.action,organizationId=options.organizationId,runId=options.runId
  if(kind==='CREATE_ORGANIZATION'){const data=await api.get('/organizations?page=1&pageSize=1');if(!data.allowedActions.includes(kind))throw new ApiError('forbidden','没有组织创建权限');return {title:'新建组织',fields:[{key:'name',label:'组织名称',required:true},{key:'firstAdminUserId',label:'首位组织管理员',required:true,selector:'organizationAccounts'}]}}
  const c=await context(organizationId)
  if(['SUSPEND','RESUME'].includes(kind)){if(!c.allowedActions.includes(kind))throw new ApiError('forbidden','当前不能执行此操作');return {title:LABELS[kind],fields:[],confirmation:'组织状态变化会影响成员、测评及报告访问。请核对所选组织。'}}
  if(kind==='CREATE_RUN'){if(!c.allowedActions.includes('ASSESSMENT_DELIVERY'))throw new ApiError('forbidden','没有测评投放权限');return {title:'新建测评批次',fields:[{key:'name',label:'批次名称',required:true},{key:'intakeDeadline',label:'截止时间',dateTime:true}]}}
  if(kind==='ADD_MEMBER'){if(!c.allowedActions.includes('GOVERN'))throw new ApiError('forbidden','没有成员管理权限');return {title:'添加成员',fields:[{key:'userId',label:'账户',required:true},{key:'orgRole',label:'组织身份',value:'MEMBER',choices:[{value:'MEMBER',label:'成员'},{value:'ORG_ADMIN',label:'组织管理员'}]}]}}
  if(kind==='ADD_TRACK'){const [detail,resources]=await Promise.all([api.get(root(organizationId)+'/runs/'+segment(runId)),api.get(root(organizationId)+'/run-resources')]);if(!detail.availableActions.includes('ADD_TRACK'))throw new ApiError('forbidden','批次当前不可编辑');return {title:'选择正式测评项目',resources:resources.list,fields:trackFields(resources.list,'0'),notice:resources.list.length?'投放策略来自该测量工具的正式发布。':'暂无获准的正式测评项目；不能用草稿或预览内容代替。'}}
  throw new ApiError('invalidRequest','组织操作无效')
 }
 function validate(fields,values){const body={};for(const f of fields){let v=values[f.key]===undefined?f.value:values[f.key];if(f.required&&(v===undefined||v===''))throw new ApiError('invalidRequest','请填写'+f.label);if(f.dateTime){if(!v)continue;const d=new Date(v);if(!Number.isFinite(d.getTime()))throw new ApiError('invalidRequest','时间格式无效');v=d.toISOString()}if(v!==undefined)body[f.key]=v}return body}
 async function execute(options,form,values){const kind=options.action,org=options.organizationId,run=options.runId,body=validate(form.fields,values)
  // Server creates command keys; a form/retry retains one key without generating
  // a new governance episode. Key obtained from the common discovery endpoint.
  if(['CREATE_ORGANIZATION','ADD_MEMBER','SUSPEND','RESUME'].includes(kind)&&!form.commandKey)form.commandKey=(await api.get('/mobile/context/profile')).commandKey
  if(kind==='CREATE_ORGANIZATION')return api.post('/organizations',{...body,commandKey:form.commandKey})
  if(kind==='ADD_MEMBER')return api.post(root(org)+'/memberships',{...body,commandKey:form.commandKey})
  if(kind==='SUSPEND'||kind==='RESUME')return api.post(root(org)+'/'+kind.toLowerCase(),{commandKey:form.commandKey})
  if(kind==='CREATE_RUN')return api.post(root(org)+'/runs',body)
  if(kind==='ADD_TRACK'){
   const resource=form.resources[Number(body.resourceIndex)];if(!resource)throw new ApiError('invalidRequest','请选择测评项目')
   const policy={analysisMode:resource.analysisMode,visibilityPolicyKey:resource.visibilityPolicyKey,minimumRespondents:resource.minimumRespondents}
   for(const key of ['subjectRoles','respondentRoles','relationshipKinds','perspectives']){if(!resource[key].includes(body[key]))throw new ApiError('invalidRequest','投放策略超出工具允许范围');policy[key]=[body[key]]}
   const ids=value=>String(value||'').split(/[,，\s]+/).filter(Boolean)
   const selector=prefix=>{const kind=body[prefix+'Kind'];if(kind==='ALL_CURRENT'||kind==='RELATED_PARENT')return {kind};const selected=ids(body[prefix+'Ids']);if(!selected.length)throw new ApiError('invalidRequest','请填写指定范围编号');if(kind==='MEMBERSHIP_IDS')return {kind,membershipIds:selected};if(kind==='CLASS_UNITS')return {kind,classUnitIds:selected};if(kind==='LABELS')return {kind,labelIds:selected,match:body[prefix+'Match']};throw new ApiError('invalidRequest','投放范围无效')}
   if(body.targetMode){if(!resource.allowedTargetModes.includes(body.targetMode))throw new ApiError('invalidRequest','评价对象策略无效');policy.targetPolicy={mode:body.targetMode,...(body.targetMode==='SELECTED_CLASS_TEACHERS'?{teacherMembershipIds:ids(body.teacherMembershipIds)}:{}),...(body.targetMode==='COURSE_TEACHER'?{courseId:body.courseId}:{})}}
   return api.post(root(org)+'/runs/'+segment(run)+'/tracks',{resource:{family:resource.family,key:resource.key,version:resource.version},subjectSelector:selector('subject'),respondentSelector:selector('respondent'),requestedPolicy:policy})
  }
  throw new ApiError('invalidRequest','操作无效')
 }
 async function preview(org,run,version){return api.post(root(org)+'/runs/'+segment(run)+'/preview',{expectedVersion:version})}
 async function publish(org,run,version){return api.post(root(org)+'/runs/'+segment(run)+'/publish',{expectedVersion:version})}
 async function lifecycle(org,run,action){if(!['CLOSE','CANCEL'].includes(action))throw new ApiError('invalidRequest','操作无效');return api.post(root(org)+'/runs/'+segment(run)+'/'+action.toLowerCase(),{})}
 return {view,form,execute,preview,publish,lifecycle,trackFields}
}
module.exports={createOrganizationService}
