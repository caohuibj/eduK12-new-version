const {ApiError}=require('../../core/errors/index')
const {projectCourseAssessments}=require('./course-assessment-projection')
const {answerRows,timestamp}=require('../../core/format/index')
const {reportTarget}=require('../assessments/reports')
const id=value=>{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new ApiError('invalidRequest','课程或任务标识无效');return encodeURIComponent(value)}
function createTrainingService(api,session){
 function student(){const s=session.get();if(!s.user||s.product!=='training-student'||!s.capabilities.canReadCourses)throw new ApiError('forbidden','请使用 Training 学员账号登录')}
 async function course(courseId){student();const c=await api.get('/courses/'+id(courseId));if(!c||c.isLibrary||c.courseType==='CAMPUS_ACTIVITY')throw new ApiError('forbidden','此入口只开放培训课程');return c}
 async function courses(cursor){student();const data=await api.get('/courses/my'+(cursor?'?cursor='+encodeURIComponent(cursor):''));if(!Array.isArray(data.list))throw new ApiError('invalidResponse','课程列表响应无效');return {courses:data.list.map(c=>({id:c.id,title:c.title,description:c.description||'进入课程，查看练习、打卡与测评'})),nextCursor:data.nextCursor||null}}
 async function composites(courseId){
  const available=(await api.get('/composite-assessments/available')).list||[],delivered=new Set()
  if(available.some(c=>c.productKind==='QUESTIONNAIRE'&&!c.course)){
   let page=1,read=0,total=1
   while(read<total&&page<=50){const data=await api.get('/courses/my/tasks?page='+page+'&pageSize=100&courseId='+id(courseId)),rows=data.list||[];total=data.total||0;if(!rows.length&&read<total)throw new Error('课程任务列表不完整');for(const row of rows)if(row.kind==='COMPOSITE'&&row.courses?.some(c=>c.id===courseId))delivered.add(row.id);read+=rows.length;page++}
   if(read<total)throw new Error('课程任务数量超出查询限制，请联系培训师')
  }
  return available.filter(c=>c.course?.id===courseId||delivered.has(c.id))
 }
 async function assessments(courseId){
  student();if(!session.get().capabilities.canReadOwnAssessments)throw new ApiError('forbidden','测评入口尚未开放')
  const errors=[]
  const read=async(label,task)=>{try{return await task()}catch(e){errors.push(label+'读取失败：'+e.message);return []}}
  const [questions,scales,cognitives,composite]=await Promise.all([
   read('问卷',async()=> (await api.get('/questionnaires/available?courseId='+id(courseId))).list||[]),
   read('量表',async()=> (await api.get('/scales/available')).list||[]),
   read('认知测评',()=>api.get('/cognitive/assignments/my')),
   read('组合测评',()=>composites(courseId)),
  ])
  const sources=new Map([...questions.map(v=>['questionnaire:'+v.id,v]),...scales.map(v=>['scale:'+v.id,v]),...cognitives.map(v=>['cognitive:'+v.id,v]),...composite.map(v=>['composite:'+v.id,v])])
  return {items:projectCourseAssessments(courseId,questions,scales,cognitives,composite,session.get().runtime.cognitive===true).map(row=>({...row,source:sources.get(row.key)})),errors}
 }
 async function section(courseId,kind){
  const c=await course(courseId)
  if(kind==='assessments')return {course:c,...await assessments(courseId)}
  if(!['assignments','checkins'].includes(kind))throw new ApiError('invalidRequest','课程栏目无效')
  const cap=kind==='assignments'?'canReadAssignments':'canReadCheckins';if(!session.get().capabilities[cap])throw new ApiError('forbidden','此任务入口未开放')
  const data=await api.get('/courses/'+id(courseId)+'/'+kind)
  return {course:c,errors:[],items:(data.list||[]).map(v=>{
   const done=kind==='assignments'?['SUBMITTED','GRADED'].includes(v.mySubmission?.status)||Boolean(v.submitted&&!v.mySubmission):Boolean(v.submission||v.submitted)
   const draft=kind==='assignments'&&v.mySubmission?.status==='DRAFT',end=kind==='assignments'?v.deadline:v.endTime,expired=Boolean(end&&Date.parse(end)<Date.now())
   return {key:v.id,name:v.title,description:v.description||'',status:done?kind==='assignments'?'已提交':'已打卡':expired?'已截止':draft?'已保存草稿':'待完成',action:done?'查看记录':expired?'查看任务':draft?'继续练习':kind==='assignments'?'完成练习':'去打卡',href:true}
  })}
 }
 async function assessmentEntry(courseId,key){
  await course(courseId)
  const result=await assessments(courseId),row=result.items.find(v=>v.key===key)
  if(!row)throw new ApiError('notFound',result.errors.length?'测评读取未完成，请返回课程刷新':'此测评已撤回或当前无权访问')
  const source=row.source,family=row.kind.toUpperCase(),resourceId=key.slice(key.indexOf(':')+1)
  const feedback=row.href&&(/\/result\//.test(row.href)||/\/report$/.test(row.href)||/\/result$/.test(row.href))?row.href:null
  const resumeId=row.status==='进行中'?(family==='COMPOSITE'?source.attempt?.id:source.assessmentId):null
  return {row,report:feedback?reportTarget(feedback):null,launch:row.href&&!feedback&&family!=='COGNITIVE'?{family,resourceId,webTarget:row.href,...(resumeId?{rootId:resumeId}:{})}:null}
 }
 async function ownSubmission(kind,taskId,entity){
  student();if(!['assignments','checkins'].includes(kind)||!session.get().capabilities[kind==='assignments'?'canReadAssignments':'canReadCheckins'])throw new ApiError('forbidden','此任务入口未开放')
  const record=kind==='assignments'?entity.mySubmission:await api.get('/checkins/'+id(taskId)+'/my-submission')
  if(!record)return null
  return {content:record.content||'',facts:[{label:'状态',value:record.status==='DRAFT'?'草稿':record.status==='GRADED'?'已批改':'已提交'},...answerRows(entity.questions,record.answers),...(record.comment?[{label:'培训师评语',value:record.comment}]:[]),...(record.submittedAt?[{label:'提交时间',value:timestamp(record.submittedAt)}]:[])],images:record.images||[]}
 }
 return {courses,course,section,assessmentEntry,ownSubmission}
}
module.exports={createTrainingService}
