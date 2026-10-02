const { ApiError } = require('../../core/errors/index')
const {normalize,payload,id}=require('./contracts')
const renderers=require('./renderers'),web=require('./web-runtime')
function submitPath(meta){const root=id(meta.attemptId),unit=id(meta.unitId)
 if(meta.family==='SCALE'&&meta.unitKind==='SCALE'&&root===unit)return '/scales/assessments/'+root+'/submit'
 if(meta.family==='QUESTIONNAIRE'&&['FORM','SCALE'].includes(meta.unitKind))return '/questionnaires/assessments/'+root+(meta.unitKind==='FORM'?'/form-sections/':'/scales/')+unit+'/submit'
 if(meta.family==='COMPOSITE'&&meta.unitKind==='SCALE')return '/composite-assessments/attempts/'+root+'/items/'+unit+'/scale/submit'
 if(meta.family==='COMPOSITE'&&meta.unitKind==='FORM')return '/composite-assessments/attempts/'+root+'/form-sections/'+unit+'/submit'
 if(meta.family==='SITUATIONAL'&&meta.unitKind==='SITUATIONAL'&&root===unit)return '/situational/attempts/'+root+'/submit'
 throw new ApiError('draftConflict','封存提交路由不能验证')
}
function createAssessmentService(api,session,drafts,config){
 function owner(){const s=session.get();if(!s.user||!s.capabilities.canReadOwnAssessments)throw new ApiError('forbidden','请重新登录后打开测评');return s.user.id}
 function native(){owner();if(!session.get().capabilities.canUseAssessmentRuntime)throw new ApiError('capabilityMismatch','原生测评尚未开放，请使用正式网页测评')}
 function launch(task){const target=task.launchTarget||(task.sourceType==='ORGANIZATION_RUN'?'/organization-tasks':task.sourceType==='RELATIONAL'?'/relational/tasks':null);if(!target)return null;web.path(target);const routes=[['SCALE',/^\/student\/scales\/([A-Za-z0-9_-]+)$/],['QUESTIONNAIRE',/^\/student\/questionnaires\/([A-Za-z0-9_-]+)$/],['COMPOSITE',/^\/student\/composite\/([A-Za-z0-9_-]+)$/],['SITUATIONAL',/^\/student\/situational\/([A-Za-z0-9_-]+)$/]];for(const [family,re] of routes){const m=target.match(re);if(m)return {family,resourceId:m[1],version:task.resourceVersion,webTarget:target}}return {family:'WEB',webTarget:target}}
 async function entry(taskId){owner();const data=await api.get('/my-assessments'),task=data.list.find(t=>t.taskId===taskId);if(!task)throw new ApiError('notFound','测评不存在或当前无权访问');return {task,launch:launch(task),canOpenReport:Boolean(task.summaryTarget||task.reportTarget),truncated:data.truncated===true}}
 async function catalog(){owner();const data=await api.get('/my-assessments/catalog');return data.list.map((t,i)=>({id:String(i),title:t.title,resource:t.journey.resource,launch:launch({launchTarget:t.launchTarget,resourceVersion:t.journey.resource.version}),value:t}))}
 async function begin(target,context){native();const family=target.family,resourceId=target.resourceId;let raw
  if(family==='SCALE')raw=await api.post('/scales/'+id(resourceId)+'/assessments',context?{context}:{})
  else if(family==='QUESTIONNAIRE')raw=await api.post('/questionnaires/'+id(resourceId)+'/assessments',{})
  else if(family==='COMPOSITE')raw=await api.post('/composite-assessments/'+id(resourceId)+'/attempts',{})
  else if(family==='SITUATIONAL')raw=await api.post('/situational/attempts',{instrumentKey:resourceId,...(target.version?{instrumentVersion:target.version}:{})})
  else throw new ApiError('unsupportedRenderer','此测评使用正式网页测评')
  if(raw.preflight)return {state:'preflight',requiredContextKeys:raw.preflight.requiredContextKeys}
  const root=family==='SCALE'?raw.assessment:family==='QUESTIONNAIRE'?raw.questionnaireAssessment:family==='COMPOSITE'?raw.attempt||raw:raw.attempt
  return {family,resourceId,rootId:root.id,webTarget:target.webTarget}
 }
 async function resume(handle){native();const userId=owner(),family=handle.family,rootId=id(handle.rootId);let raw
  if(family==='SCALE')raw=await api.get('/mobile/assessment-runtime/scales/'+rootId)
  else if(family==='QUESTIONNAIRE')raw=await api.get('/questionnaires/assessments/'+rootId)
  else if(family==='COMPOSITE')raw=await api.get('/composite-assessments/attempts/'+rootId)
  else if(family==='SITUATIONAL')raw=await api.get('/situational/attempts/'+rootId)
  else throw new ApiError('unsupportedRenderer','此测评使用正式网页测评')
  const pending=await drafts.pending(userId,family,rootId)
  let unit
  try{unit=normalize(family,raw,userId,handle.resourceId)}catch(e){if(!pending)throw e;unit={family,rootId,items:[],title:'确认上一单元提交',rootStatus:raw.assessment?.status||raw.questionnaireAssessment?.status||(raw.attempt||raw).status,state:'recoverable'}}
  if(pending&&(!unit.meta||pending.identity!==require('../../core/drafts/index').identity(unit.meta)))return {...unit,currentMeta:unit.meta,meta:pending.meta,unitKind:pending.meta.unitKind,draft:pending,items:[],submitPath:submitPath(pending.meta),initial:{},state:'recoverable',recovery:true,needsComplete:false}

  if(unit.meta){let draft;try{draft=await drafts.open(unit.meta)}catch(e){if(e.kind==='draftConflict')return {...unit,state:'draftConflict',draft:null};throw e};if(!Object.keys(draft.values).length&&Object.keys(unit.initial).length)draft=await drafts.save(unit.meta,{...draft,values:unit.initial});unit.draft=draft;unit.state=draft.state}
  return unit
 }
 async function savePending(unit){native();unit.editFlight=(unit.editFlight||Promise.resolve()).catch(()=>{}).then(async()=>{if(unit.draft.state!=='draft')throw new ApiError('sealed','答案已封存');const pending={...(unit.pendingValues||{})};unit.draft=await drafts.save(unit.meta,{...unit.draft,values:{...unit.draft.values,...pending}});for(const key of Object.keys(pending))if(JSON.stringify(unit.pendingValues[key])===JSON.stringify(pending[key]))delete unit.pendingValues[key];return unit.draft});return unit.editFlight}
 async function change(unit,key,value){native();if(unit.draft.state!=='draft'||unit.submitFlight)throw new ApiError('sealed','答案已封存，只能重试原提交');const item=unit.items.find(i=>i.key===key);if(!item)throw new ApiError('invalidRequest','题目已变化');unit.pendingValues=unit.pendingValues||{};unit.pendingValues[key]=renderers.fromInput(item,value);return savePending(unit)}
 async function submit(unit){native();if(!unit.meta||!unit.draft)throw new ApiError('invalidRequest','请重新打开测评');if(unit.retryAt&&Date.now()<unit.retryAt)throw new ApiError('rateLimited','请等待服务器要求的间隔后重试',{retryAfterMs:unit.retryAt-Date.now()});if(!unit.submitFlight)unit.submitFlight=(async()=>{try{if(unit.editFlight)await unit.editFlight;if(Object.keys(unit.pendingValues||{}).length)throw new ApiError('storageUnavailable','存在未保存的答案，请先重试保存草稿');const body=unit.draft.state==='sealed'?unit.draft.payload:payload(unit,unit.draft.values);if(unit.draft.state!=='sealed'&&unit.unitKind==='SCALE')body.deviceInputProvenance={schemaVersion:1,deviceClass:'UNKNOWN',primaryPointer:'UNKNOWN',browserFamily:'Other',capturedAt:new Date().toISOString()};unit.draft=await drafts.seal(unit.meta,unit.draft,body);const result=await api.post(unit.submitPath,unit.draft.payload);await drafts.remove(unit.meta);unit.state='submitted';return result}catch(e){if(e.retryAfterMs)unit.retryAt=Date.now()+e.retryAfterMs;unit.state=unit.draft&&unit.draft.state==='sealed'?(e.status===409?'conflict':'recoverable'):'draft';throw e}finally{unit.submitFlight=null}})();return unit.submitFlight}
 async function finish(unit){native();if(!unit.needsComplete)throw new ApiError('invalidRequest','当前不需要完成操作');return api.post('/questionnaires/assessments/'+id(unit.rootId)+'/complete',{})}
 async function restart(unit){native();const fresh=await resume({family:unit.family,rootId:unit.rootId,resourceId:unit.resourceId});if(fresh.recovery&&(!fresh.currentMeta||fresh.currentMeta.attemptEpoch===fresh.meta.attemptEpoch))throw new ApiError('conflict','请先确认封存提交回执，再决定是否重启');if(!fresh.meta||(fresh.currentMeta||fresh.meta).attemptEpoch!==unit.meta.attemptEpoch)throw new ApiError('conflict','服务器轮次已经变化，请刷新，不再重复重启');if(!['SCALE','QUESTIONNAIRE','COMPOSITE'].includes(unit.family))throw new ApiError('unsupportedRenderer','请在正式网页确认重启');const prefix={SCALE:'/scales/assessments/',QUESTIONNAIRE:'/questionnaires/assessments/',COMPOSITE:'/composite-assessments/attempts/'}[unit.family];const result=await api.post(prefix+id(unit.rootId)+'/restart',{});if(unit.meta)await drafts.remove(unit.meta);const next=result.assessment||result.questionnaireAssessment||result.attempt||result;if(!next.id)throw new ApiError('invalidResponse','重启已请求，请返回任务列表核对新记录');return {...result,handle:{family:unit.family,resourceId:unit.resourceId,rootId:id(next.id)}}}
 async function discardStale(unit){native();const fresh=await resume({family:unit.family,rootId:unit.rootId,resourceId:unit.resourceId});const current=fresh.currentMeta||fresh.meta;if(!current)throw new ApiError('conflict','请先确认原提交回执');if(fresh.recovery){if(current.attemptEpoch===fresh.meta.attemptEpoch)throw new ApiError('conflict','同一轮次的封存提交仍需确认回执');await drafts.remove(fresh.meta)}else await drafts.discardStale(current)}
 function webTarget(value){return web.url(config,value)}
 return {entry,catalog,begin,resume,change,savePending,submit,finish,restart,discardStale,webTarget,launch,renderers}
}
module.exports={createAssessmentService,submitPath}
