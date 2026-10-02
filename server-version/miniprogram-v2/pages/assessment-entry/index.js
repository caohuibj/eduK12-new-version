const { workspacePage } = require('../../app/pages/index')
const context = require('../../domains/assessments/context')
const { reportTarget } = require('../../domains/assessments/reports')
const runnerUrl = handle => '/pages/runner/index?' + Object.entries(handle).filter(([,v])=>v!==undefined).map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')
Page(workspacePage({
 setup(o){this.id=o.id;this.mode=o.mode||'task';this.target=null;this.task=null;this.startUnknown=false},
 reset(){this.target=null;this.task=null;this.startUnknown=false},
 async fetch(runtime){
  const sequence=this.sequence
  if(this.mode==='catalog'){const entries=await runtime.assessments.catalog();if(sequence!==this.sequence)return {};this.entries=entries;return {title:'可用测评',entries:entries.map(e=>({id:e.id,title:e.title,canOpen:true})),empty:!entries.length,notice:'以服务器发布状态与适用范围为准。'}}
  const entry=await runtime.assessments.entry(this.id);if(sequence!==this.sequence)return {};this.task=entry.task;this.target=entry.launch
  return {title:entry.task.title,description:entry.task.feedback?.title||entry.task.state,canStart:Boolean(this.target),canReport:entry.canOpenReport,canWeb:Boolean(this.target),contextFields:[],notice:'作答以服务器当前权限与冻结定义为准。部分题型使用正式网页。',truncated:entry.truncated}
 },
 methods:{
 select(e){const entry=this.entries?.find(v=>v.id===e.detail.id);if(!entry)return;this.target=entry.launch;this.task=null;this.setData({title:entry.title,entries:[],canStart:Boolean(this.target),canWeb:Boolean(this.target),contextFields:[],empty:false,notice:'请确认后开始；服务器将再次检查适用范围。'})},
 contextChange(e){const key=e.currentTarget.dataset.key;this.setData({contextFields:(this.data.contextFields||[]).map(f=>f.key===key?{...f,value:e.detail.value}:f)})},
 async start(){
  if(!this.target||this.startUnknown||this.data.status==='submitting')return
  if(this.target.family==='WEB'||!getApp().runtime.session.get().capabilities.canUseAssessmentRuntime)return this.web()
  const sequence=this.sequence;this.setData({status:'submitting',actionError:''})
  try{
   let handle
   if(this.task?.sourceType==='SELF_SERVICE'&&this.task.state==='IN_PROGRESS')handle={...this.target,rootId:this.task.sourceId}
   else handle=await getApp().runtime.assessments.begin(this.target,this.data.contextFields?.length?context.values(this.data.contextFields):undefined)
   if(sequence!==this.sequence)return
   if(handle.state==='preflight'){this.setData({status:'ready',contextFields:context.fields(handle.requiredContextKeys),notice:'服务器要求补充背景信息；提交后在本轮冻结。'});return}
   this.setData({status:'ready'});wx.navigateTo({url:runnerUrl(handle)})
  }catch(e){if(sequence===this.sequence){this.startUnknown=e.kind==='network'||e.kind==='serverUnavailable';this.setData({status:'ready',canStart:!this.startUnknown,actionError:e.message+(this.startUnknown?'。开始结果尚未确认，请返回“我的测评”核对并继续已有记录。':'')})}}
 },
 report(){if(!this.task||!this.data.canReport)return;const target=reportTarget(this.task.summaryTarget||this.task.reportTarget);wx.navigateTo({url:target.family==='WEB'?'/pages/web-runtime/index?path='+encodeURIComponent(target.path):'/pages/report/index?family='+encodeURIComponent(target.family)+'&id='+encodeURIComponent(target.id)+'&webTarget='+encodeURIComponent(target.path)})},
 web(){if(this.target?.webTarget)wx.navigateTo({url:'/pages/web-runtime/index?path='+encodeURIComponent(this.target.webTarget)})},
 }}))
