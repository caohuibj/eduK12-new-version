const { ApiError } = require('../../core/errors/index')
const DOMAINS = {
 courses:{title:'课程',capability:'canReadCourses',path:'/courses'},
 assignments:{title:'作业',capability:'canReadAssignments',path:'/assignments'},
 checkins:{title:'打卡',capability:'canReadCheckins',path:'/checkins'},
 students:{title:'学生',capability:'canReadStudents',path:'/mobile/students'},
 classrooms:{title:'课堂',capability:'canReadClassrooms',path:'/classrooms'},
 users:{title:'用户',capability:'canReadUsers',path:'/users'},
 teacherCodes:{title:'教师邀请码',capability:'canReadTeacherCodes',path:'/teacher-codes'},
 profile:{title:'个人资料',capability:'canReadProfile',path:'/users'},
 shareTargets:{title:'内容分享对象',capability:'canManageCourse',path:'/mobile/courses'},
 organizationAccounts:{title:'组织账户',capability:'canDiscoverOrganizations',path:'/mobile/platform-user-options'},
 catalog:{title:'测量工具目录',capability:'canReadCatalog',path:'/scale-library'},
}
const ACTIONS = {
 create:'新建',edit:'编辑',join:'加入课程',submit:'提交',students:'学生名单',assignments:'作业',checkins:'打卡',
 createAssignment:'发布作业',createCheckin:'发布打卡',createClassroom:'创建课堂',clone:'复制课程',rotateCode:'轮换课程码',share:'分享课程内容',
 stopRecruiting:'停止招募',resumeRecruiting:'恢复招募',end:'结束课程',submissions:'查看提交',batchGrade:'批量评语',
 others:'查看获准的同学打卡',tokens:'公开打卡链接',createToken:'创建公开打卡链接',anonymous:'匿名打卡设置',
 approveTeacher:'批准教师',deactivate:'停用账户',activate:'启用账户',resetPassword:'重置密码',delete:'删除',
 extendAccount:'教师账户续期',live:'实时课堂',questions:'课堂题目',cover:'上传课程封面',qrcode:'课堂加入信息',duplicate:'复制课堂',addQuestion:'添加课堂题目',
}
const id = value => {if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new ApiError('invalidRequest','内容标识无效');return encodeURIComponent(value)}
const query = values => Object.entries(values).filter(([,v])=>v!==undefined&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')
const field = (key,label,extras={}) => Object.assign({key,label,value:'',required:false,type:'text'},extras)
const actionRows = allowed => (allowed||[]).filter(key=>ACTIONS[key]).map(key=>({key,label:ACTIONS[key]}))
const label = value => ({PUBLISHED:'已发布',DRAFT:'草稿',COMPLETED:'已完成',SUBMITTED:'已提交',GRADED:'已批改',PREPARING:'准备中',ACTIVE:'进行中',ENDED:'已结束'}[value]||value||'')
function listRows(domain,list,view='') {
 return list.map(item=>({id:String(item.id),title:item.title||item.name||(item.questionContent&&item.questionContent.question)||item.nickname||item.username||item.code||(item.student&&(item.student.nickname||item.student.username))||'记录',
  status:label(item.state||item.status),detail:view==='submissions'?(item.content||''):item.description||'',canOpen:true,domain,
  value:item}))
}
function createOperations(api,session) {
 function spec(domain){const d=DOMAINS[domain];if(!d||!session.get().capabilities[d.capability])throw new ApiError('forbidden','此入口不可用');return d}
 async function context(domain,resourceId){spec(domain);return api.get('/mobile/context/'+domain+(resourceId?'/'+id(resourceId):''))}
 function resourcePath(domain,resourceId){return spec(domain).path+'/'+id(resourceId)}
 async function raw(domain,resourceId){if(domain==='teacherCodes'){const c=await context(domain,resourceId);return c.fields}return api.get(resourcePath(domain,resourceId))}
 async function list(domain,options={}) {
  const d=spec(domain), page=options.page||1, parent=options.parent, view=options.view||''
  let path=d.path, collection=true, allowed=[], data
  const mobileList=['courses','assignments','checkins','classrooms','teacherCodes'].includes(domain)&&!view
  if(mobileList)path='/mobile/lists/'+domain
  if(domain==='shareTargets'){path='/mobile/courses/'+id(parent)+'/share-options';collection=false}
  else if(parent){id(parent);collection=false
   if(['assignments','checkins'].includes(domain)&&view==='')path='/mobile/lists/'+domain
   else if(['assignments','checkins'].includes(domain)&&['submissions','others','tokens'].includes(view))path=resourcePath(domain,parent)+'/'+({others:'others-submissions'}[view]||view)
   else if(domain==='students')path='/courses/'+id(parent)+'/students'
   else if(domain==='classrooms'&&view==='questions')path=resourcePath(domain,parent)+'/questions'
   else throw new ApiError('invalidRequest','列表入口无效')
  }
  const values={page,pageSize:20,keyword:options.keyword||undefined,...(parent&&!view&&['assignments','checkins'].includes(domain)?{courseId:parent}:{})}
  if(domain==='catalog') {
   data=await api.get(path+'?'+query({keyword:options.keyword||undefined}))
   if(!Array.isArray(data.entries))throw new ApiError('invalidResponse','目录响应无效')
   return {title:d.title,list:data.entries.map(entry=>({id:entry.identity.instrumentKey+'@'+entry.identity.instrumentVersion,title:entry.identity.canonicalName,status:label(entry.availability&&entry.availability.status),detail:entry.report&&entry.report.disclaimer||'',canOpen:true,domain,value:entry})),hasMore:false,actions:[]}
  }
  const result=await Promise.all([api.get(path+'?'+query(values)),collection&&!mobileList&&!['students','organizationAccounts'].includes(domain)?context(domain):Promise.resolve(null)])
  data=result[0];if(result[1])allowed=result[1].allowedActions;else if(Array.isArray(data.allowedActions))allowed=data.allowedActions
  const items=Array.isArray(data)?data:(data.list||data.questions)
  if(!Array.isArray(items))throw new ApiError('invalidResponse','列表响应无效')
  // Older unpaged endpoints return a complete list. Do not pretend pagination.
  const paged=data.pageSize!==undefined&&data.page!==undefined
  return {title:d.title,list:listRows(domain,items,view).map(row=>Object.assign(row,{sourcePage:page})),total:data.total||items.length,page,hasMore:paged&&page*20<data.total,
   actions:actionRows(allowed),commandKey:data.commandKey||(result[1]&&result[1].commandKey),view,parent}
 }
 async function detail(domain,resourceId) {
  if(domain==='catalog') {
   spec(domain);const split=resourceId.lastIndexOf('@');if(split<1)throw new ApiError('invalidRequest','工具标识无效')
   const version=resourceId.slice(split+1);if(!/^[A-Za-z0-9_.-]{1,128}$/.test(version)||version.includes('..'))throw new ApiError('invalidRequest','工具版本无效');const data=await api.get('/scale-library/'+id(resourceId.slice(0,split))+'/'+encodeURIComponent(version))
   const entry=data.entry;return {title:entry.identity.canonicalName,description:entry.report.disclaimer,content:'',actions:session.get().capabilities.canManageParentToolDisclosure?[{key:'parentPolicy',label:'家长披露设置'}]:[],entity:entry,
    facts:[{label:'适用状态',value:entry.availability.status},{label:'版本',value:entry.identity.instrumentVersion},{label:'报告限制',value:(entry.report.limitations||[]).join('；')}],notice:'此处展示正式目录信息。测评作答及完整报告在 Runtime 阶段接入。'}
  }
  const [entity,c]=await Promise.all([raw(domain,resourceId),context(domain,resourceId)])
  const facts=[]
  for(const [key,name] of [['courseCode','课程码'],['code','邀请码'],['deadline','截止时间'],['endTime','截止时间'],['phone','电话'],['username','用户名'],['studentCount','学生人数']])if(entity[key]!==undefined&&entity[key]!==null)facts.push({label:name,value:String(entity[key])})
  return {title:entity.title||entity.name||entity.nickname||entity.username||entity.code||'详情',description:entity.description||'',content:entity.content||'',resourceStatus:label(entity.status),
   entity,actions:actionRows(c.allowedActions),commandKey:c.commandKey,fields:c.fields,facts,images:(entity.images||[]).filter(i=>i&&typeof i.url==='string').map(i=>Object.assign({},i,{url:api.assetUrl(i.url)})),attachments:[].concat(entity.documents||[],entity.videos||[]),
   notice:''}
 }
 async function prepareForm(domain,resourceId,action) {
  const c=await context(domain,resourceId);if(!c.allowedActions.includes(action))throw new ApiError('forbidden','操作权限已变化，请刷新')
  const entity=resourceId?await raw(domain,resourceId):{}, fields=[]
  const add=(key,name,extras={})=>fields.push(field(key,name,Object.assign({value:entity[key]==null?'':String(entity[key])},extras)))
  if(action==='join')add('courseCode','课程码',{required:true,maxlength:16})
  else if(action==='create'||action==='edit') {
   if(domain==='courses'){add('title','课程名称',{required:true});add('description','课程介绍',{multiline:true,maxlength:5000})}
   if(domain==='assignments'||domain==='checkins') {
    if(action==='create')add('courseId','课程',{required:true,selector:'courses'})
    add('title',domain==='assignments'?'作业名称':'打卡名称',{required:true});add('description','说明',{multiline:true,maxlength:5000});add('content','内容',{multiline:true,maxlength:20000});add(domain==='assignments'?'deadline':'endTime','截止时间',{dateTime:true})
    if(domain==='assignments')add('questions','作业题目',{type:'questions',value:entity.questions||[]})
    if(domain==='checkins')add('allowViewOthers','允许学生查看同学打卡',{type:'boolean',value:entity.allowViewOthers===true})
   }
   if(domain==='classrooms'){if(action==='create')add('courseId','课程',{required:true,selector:'courses'});add('name','课堂名称',{required:true})}
   if(domain==='users'||domain==='profile'){
    if(action==='create'){add('username','用户名',{required:true});add('password','初始密码',{required:true,password:true,maxlength:128});add('role','用户身份',{required:true,choices:[{value:'STUDENT',label:'学生'},{value:'TEACHER',label:'教师'},{value:'ADMIN',label:'管理员'},{value:'PARENT',label:'家长'}],value:'STUDENT'})}
    add('nickname','显示名称');if(action==='edit')add('phone','电话')
   }
   if(domain==='teacherCodes'){add('maxUses','最多使用次数',{required:true,type:'number',value:'1'});add('expiresAt','到期时间',{dateTime:true})}
  } else if(action==='submit') {
   add('content','提交内容',{multiline:true,maxlength:domain==='checkins'?1000:20000})
   if(domain==='assignments')for(const [index,q] of (entity.questions||[]).entries())fields.push(field('answer:'+String(q.id||index),q.question||q.title||('题目'+(index+1)),{multiline:q.type==='text',choices:['single_choice','multiple_choice'].includes(q.type)?(q.options||[]).map(o=>({value:o.key,label:o.text})):undefined,multiple:q.type==='multiple_choice',value:(q.type==='multiple_choice'?String(entity.mySubmission&&entity.mySubmission.answers&&(entity.mySubmission.answers[q.id]||entity.mySubmission.answers[index])||'').split(',').filter(Boolean):entity.mySubmission&&entity.mySubmission.answers&&(entity.mySubmission.answers[q.id]||entity.mySubmission.answers[index])||'')}))
   let previous=entity.mySubmission
   if(domain==='checkins')previous=await api.get(resourcePath(domain,resourceId)+'/my-submission')
   fields.find(f=>f.key==='content').value=previous&&previous.content||''
   return {title:'提交'+spec(domain).title,fields,commandKey:c.commandKey,expectedRevision:previous&&previous.revision||0,images:previous&&previous.images||[],canUploadImages:domain==='checkins',confirmation:'提交后以服务器确认的记录为准。修改后的再次提交使用当前版本。'}
  } else if(action==='batchGrade')add('comment','给未批改作业的评语',{required:true,multiline:true,maxlength:5000})
  else if(action==='addQuestion'){add('question','题目',{required:true,multiline:true,maxlength:10000});add('type','题型',{value:'single_choice',choices:[{value:'single_choice',label:'单选'},{value:'multiple_choice',label:'多选'},{value:'fill_blank',label:'填空'},{value:'text_input',label:'文字回答'}]});add('options','选项，每行一项',{multiline:true,maxlength:5000});add('timeLimit','答题秒数',{required:true,type:'number',value:'60'})}
  else if(action==='extendAccount')add('months','续期月数',{required:true,type:'number',value:'12'})
  else if(action==='share')add('userIds','分享给教师',{required:true,selector:'shareTargets',selectorParent:resourceId,multiple:true})
  else if(action==='anonymous')add('allowAnonymous','允许匿名打卡',{type:'boolean',value:entity.allowAnonymous===true})
  else if(action==='createToken'){add('expiresAt','链接到期时间',{required:true,dateTime:true});add('maxUses','使用次数上限（0 表示不限）',{required:true,type:'number',value:'1'})}
  const confirmations={rotateCode:'旧课程码将立即失效。已加入的学生保留课程关系。',end:'结束后将停止课程招募。请确认当前课程已完成。',approveTeacher:'确认批准这个教师账户？',deactivate:'账户停用后无法继续使用。服务器会检查组织管理员保留条件。',resetPassword:'重置后原登录失效。临时密码保存在服务器受保护的交接文件中，需要通过现有交接流程提供给用户。',delete:'此操作会删除该邀请码，确认后无法恢复。',anonymous:'启用匿名打卡将允许持有效公开链接的人提交，请确认用途和有效期。'}
  return {title:ACTIONS[action],fields,images:Array.isArray(entity.images)?entity.images:[],canUploadImages:['assignments','checkins'].includes(domain)&&['create','edit'].includes(action),commandKey:c.commandKey,entity,confirmation:confirmations[action]||'请核对内容后提交。'}
 }
 function payload(fields,values) {
  const body={}
  for(const f of fields){let value=values[f.key]===undefined?f.value:values[f.key]
   if(f.required&&(value===''||value==null||(Array.isArray(value)&&!value.length)))throw new ApiError('invalidRequest','请填写'+f.label)
   if(f.dateTime){if(!value)continue;const date=new Date(value);if(!Number.isFinite(date.getTime()))throw new ApiError('invalidRequest',f.label+'格式无效');value=date.toISOString()}
   else if(f.type==='questions'){if(!Array.isArray(value)||value.length>100)throw new ApiError('invalidRequest','作业题目数量无效');for(const q of value){if(!q.id||!q.question.trim()||!['text','single_choice','multiple_choice'].includes(q.type))throw new ApiError('invalidRequest','请填写题目并选择题型');if(q.type!=='text'){if(!Array.isArray(q.options)||q.options.length<2||new Set(q.options.map(o=>o.key)).size!==q.options.length||q.options.some(o=>!o.text.trim()||!Number.isFinite(o.points)))throw new ApiError('invalidRequest','选择题须有至少两个不同选项及有效分值')}}}
   else if(f.type==='number'){value=Number(value);if(!Number.isSafeInteger(value)||value<0)throw new ApiError('invalidRequest',f.label+'必须为非负整数')}
   if(!f.key.startsWith('answer:'))body[f.key]=value
  }
  return body
 }
 async function execute(domain,resourceId,action,form,values,extras={}) {
  spec(domain)
  // Require the prepared server-owned action; never accept an arbitrary path.
  if(!form||form.domain!==domain||form.resourceId!==resourceId||form.action!==action||typeof form.commandKey!=='string')throw new ApiError('invalidRequest','请重新打开操作')
  let method='POST',path=resourceId?resourcePath(domain,resourceId):spec(domain).path,body=payload(form.fields,values)
  if(form.canUploadImages&&action!=='submit')body.images=extras.images||form.images||[]
  if(action==='edit')method='PUT'
  else if(action==='join')path+='/join'
  else if(action==='submit'){
   path+='/submit';body.expectedRevision=form.expectedRevision
   if(domain==='assignments'){body.answers={};for(const f of form.fields.filter(f=>f.key.startsWith('answer:'))){const value=values[f.key]===undefined?f.value:values[f.key];body.answers[f.key.slice(7)]=Array.isArray(value)?value.join(','):String(value||'')}}
   if(domain==='checkins')body.images=(extras.images||form.images||[]).map(image=>({assetId: typeof image==='string'?image:image.assetId})).filter(image=>image.assetId)
  }
  else if(['clone','stopRecruiting','resumeRecruiting','end','share','approveTeacher','resetPassword','duplicate'].includes(action))path+='/'+({stopRecruiting:'stop-recruiting',resumeRecruiting:'resume-recruiting',approveTeacher:'approve-teacher',resetPassword:'reset-password'}[action]||action)
  else if(action==='addQuestion'){path+='/questions';body={questionContent:{type:body.type,question:body.question,options:['single_choice','multiple_choice'].includes(body.type)?String(body.options||'').split('\n').map(x=>x.trim()).filter(Boolean).map((label,index)=>({value:String.fromCharCode(65+index),label})):[]},timeLimit:body.timeLimit};if(body.timeLimit<1||body.timeLimit>3600)throw new ApiError('invalidRequest','答题时长须为 1 至 3600 秒');if(['single_choice','multiple_choice'].includes(body.questionContent.type)&&body.questionContent.options.length<2)throw new ApiError('invalidRequest','请填写至少两个选项')}
  else if(action==='extendAccount'){if(body.months<1)throw new ApiError('invalidRequest','续期月数须为正整数');path='/auth/extend-account';body={userId:resourceId,months:body.months}}
  else if(action==='rotateCode')path+='/rotate-code'
  else if(action==='batchGrade')path+='/batch-grade'
  else if(action==='anonymous'){path+='/allow-anonymous';method='PUT'}
  else if(action==='createToken')path+='/tokens'
  else if(action==='activate'||action==='deactivate'){method='PUT';body={isActive:action==='activate'}}
  else if(action==='delete')method='DELETE'
  else if(action!=='create')throw new ApiError('invalidRequest','操作尚未支持')
  return api.request(method,path,body,action==='submit'?{idempotencyKey:form.commandKey}:undefined)
 }
 async function prepare(domain,resourceId,action){return Object.assign(await prepareForm(domain,resourceId,action),{domain,resourceId,action})}
 return {list,detail,prepare,execute,context,actionRows,resourcePath,
  uploadCover(courseId,filePath){spec('courses');return api.upload('/courses/'+id(courseId)+'/cover',filePath)},
  uploadImage(domain,resourceId,action,filePath){spec(domain);if(domain==='checkins'&&action==='submit')return api.upload(resourcePath(domain,resourceId)+'/submission-image',filePath);if(['assignments','checkins'].includes(domain)&&['create','edit'].includes(action))return api.upload('/uploads/image',filePath);throw new ApiError('forbidden','此处不能上传图片')},
  publicLink(token){spec('checkins');return api.publicCheckinUrl(token)},
  revokeToken(tokenId){spec('checkins');return api.delete('/checkins/tokens/'+id(tokenId))},
  async questionContext(classroomId,questionId){spec('classrooms');return api.get('/mobile/classrooms/'+id(classroomId)+'/questions/'+id(questionId)+'/context')},
  async question(classroomId,questionId,action,body){spec('classrooms');const path='/classrooms/'+id(classroomId)+'/questions/'+id(questionId);if(action==='stats')return api.get(path+'/stats');if(action==='delete')return api.delete(path);if(action==='edit')return api.put(path,body);throw new ApiError('invalidRequest','题目操作无效')},
  async grade(assignmentId,submissionId,comment){if(!comment.trim())throw new ApiError('invalidRequest','请填写评语');return api.post('/assignments/'+id(assignmentId)+'/submissions/'+id(submissionId)+'/grade',{comment})},
  async roster(courseId,studentId,action){if(!['freeze','unfreeze','remove','resetPassword'].includes(action))throw new ApiError('invalidRequest','操作无效');const path='/courses/'+id(courseId)+'/students/'+id(studentId);if(action==='remove')return api.delete(path);if(action==='resetPassword')return api.post(path+'/reset-password',{});return api.put(path+'/freeze',{isFrozen:action==='freeze'})},
 }
}
module.exports={createOperations,DOMAINS,ACTIONS,listRows}
