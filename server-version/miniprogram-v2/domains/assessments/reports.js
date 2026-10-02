const { ApiError } = require('../../core/errors/index')
const {id}=require('./contracts')
const web=require('./web-runtime')
const {longitudinal}=require('./longitudinal')
function reportTarget(path){const summary=typeof path==='string'&&path.match(/^\/my-assessments\/results\/([A-Za-z0-9_-]{1,128})$/);if(summary)return {family:'RUN_SUMMARY',id:summary[1],path};web.path(path);const routes=[['SCALE',/^\/student\/scales\/result\/([A-Za-z0-9_-]+)$/],['QUESTIONNAIRE',/^\/student\/questionnaires\/result\/([A-Za-z0-9_-]+)$/],['COMPOSITE',/^\/student\/composite\/attempts\/([A-Za-z0-9_-]+)\/report$/]];for(const [family,re]of routes){const m=path.match(re);if(m)return {family,id:m[1],path}}return {family:'WEB',path}}
function reportTargetForAttempt(family,root){const p={SCALE:'/student/scales/result/',QUESTIONNAIRE:'/student/questionnaires/result/',COMPOSITE:'/student/composite/attempts/',SITUATIONAL:'/student/situational/attempts/'}[family];if(!p)throw new ApiError('unsupportedRenderer','报告入口未适配');return p+id(root)+(family==='COMPOSITE'?'/report':family==='SITUATIONAL'?'/result':'')}
function scaleBlocks(report){
 if(!report||!['full','scores','educational','completion','unavailable'].includes(report.kind))throw new ApiError('unsupportedRenderer','当前报告格式需在正式网页查看')
 const blocks=[],add=(title,text)=>{if(typeof text==='string'&&text)blocks.push({title,text})}
 if(report.kind==='unavailable')add('报告尚不可用',report.reason==='POLICY_UNAVAILABLE'?'当前披露策略不允许展示。':'当前结果不可用。')
 if(report.kind==='completion')add('测评已完成','当前披露策略仅开放完成情况。')
 if(['full','scores'].includes(report.kind)){for(const score of report.scores||[]){if(typeof score.label!=='string')continue;add(score.label,score.value===null?'服务器未提供可用分数':String(score.value));add('说明',score.description)} }
 if(report.kind==='full'){
  if(report.quality){add('服务器结果质量',{interpretable:'可解释',limited:'有限解释',invalid:'不可解释'}[report.quality.status]);for(const flag of report.quality.flags||[])add('质量标记',flag)}
  const method=report.method||{};for(const [key,label]of [['instrumentVersion','工具版本'],['scoringVersion','计分版本'],['reportVersion','报告版本']])add(label,method[key])

  for(const interpretation of report.interpretations||[]){add(interpretation.headline||interpretation.label,interpretation.interpretation);for(const g of interpretation.guidance||[])add('建议',g.text);for(const l of interpretation.limitations||[])add('限制',l)}
  for(const ref of report.references||[]){add(ref.label,ref.status==='available'?'参考值：'+String(ref.value??'未提供'):'服务器未提供可用参考');if(ref.status==='available'&&ref.percentile?.value!==undefined)add('服务器提供的百分位',String(ref.percentile.value)+(ref.percentile.estimated?'（估计值）':''));if(ref.criterionBand?.label)add('服务器提供的分段',ref.criterionBand.label);if(ref.evidenceLevel)add('参考证据级别',ref.evidenceLevel);if(ref.referenceVersion)add('参考版本',ref.referenceVersion);if(ref.population?.description)add('参考人群',ref.population.description);if(ref.source?.citation)add('来源',ref.source.citation);for(const l of ref.limitations||[])add('限制',l);add('参考说明',ref.disclaimer)}
  for(const text of report.caveats||[])add('限制',text)
 }
 const educational=report.kind==='educational'?report:report.kind==='full'?report.educationalContent:null
 for(const block of educational?.blocks||[])add(block.title||'教育反馈',block.body)
 for(const choice of educational?.choices||[])add(choice.label,choice.body)
 add('说明',educational?.disclaimer);add('说明',report.disclaimer)
 return blocks.map((block,n)=>({...block,key:String(n)}))
}
function collectionBlocks(raw){if(raw.bundleReport||raw.packageReport||!Array.isArray(raw.unitReports)||raw.unitReports.some(u=>u.type!=='SCALE'))throw new ApiError('unsupportedRenderer','综合分析及其他测量单元请在正式网页查看');const blocks=[];for(const background of raw.backgroundValues||[]){if(typeof background.label==='string'&&typeof background.value==='string')blocks.push({title:background.label,text:background.value})}for(const unit of raw.unitReports){blocks.push({title:unit.scaleName,text:''});blocks.push(...scaleBlocks({...unit,kind:unit.reportKind,...(unit.reportKind==='educational'?unit.educationalFeedback||{}:{}),educationalContent:unit.educationalFeedback}))}if(!blocks.length)blocks.push({title:'测评已完成',text:'当前报告没有可披露的测量结果。'});return blocks.map((b,i)=>({...b,key:String(i)}))}
function createReportService(api,session){const owner=()=>{if(!session.get().user||!session.get().capabilities.canReadOwnAssessments)throw new ApiError('forbidden','请重新登录查看报告')};return {async listLongitudinal(){owner();const raw=await api.get('/mobile/reports/longitudinal');return {title:'我的纵向报告',list:raw.list.map(r=>({id:r.id,title:'纵向测量报告',detail:r.generatedAt,canOpen:true})),truncated:raw.truncated===true,empty:!raw.list.length}},async read(family,rootId){if(!session.get().user||!session.get().capabilities.canReadOwnAssessments)throw new ApiError('forbidden','请重新登录查看报告');const root=id(rootId);let raw,title,blocks
 if(family==='LONGITUDINAL')return longitudinal(await api.get('/my-assessments/longitudinal/'+root))
 if(family==='RUN_SUMMARY'){raw=await api.get('/my-assessments/results/'+root);if(raw.schemaVersion!==1||!['NONE','COMPLETION_ONLY','INDIVIDUAL_SUMMARY'].includes(raw.mode))throw new ApiError('invalidResponse','披露摘要格式无效');title='本次测评摘要';blocks=[{key:'state',title:'服务器披露状态',text:raw.state==='COMPLETED'?'已完成':raw.state==='WITHHELD'?'当前不披露结果':'可查看摘要'}];if(raw.state==='READY'&&raw.mode==='INDIVIDUAL_SUMMARY')for(const [key,value]of Object.entries(raw.metrics||{}))blocks.push({key,title:key,text:typeof value==='number'&&Number.isFinite(value)?String(value):'未提供可用值'})}
 else if(family==='SCALE'){raw=await api.get('/scales/assessments/'+root);title=raw.scale?.name||raw.report?.instrument?.name||'量表报告';blocks=scaleBlocks(raw.report)}
 else if(family==='QUESTIONNAIRE'){raw=await api.get('/questionnaires/assessments/'+root+'/report');title=raw.questionnaireName||'问卷报告';blocks=collectionBlocks(raw)}
 else if(family==='COMPOSITE'){raw=await api.get('/composite-assessments/attempts/'+root+'/report');title=raw.name||'综合测评报告';blocks=collectionBlocks(raw)}
 else throw new ApiError('unsupportedRenderer','当前报告使用正式网页')
 return {title,blocks,completedAt:raw.completedAt||raw.report?.completedAt||'',description:'展示服务器允许披露的结果与解释。'}
 }}}
module.exports={createReportService,reportTarget,reportTargetForAttempt,scaleBlocks,collectionBlocks}
